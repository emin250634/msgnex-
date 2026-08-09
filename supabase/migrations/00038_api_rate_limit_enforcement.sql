-- Enforces plan-based API request limits for external SMS dispatch.

CREATE INDEX IF NOT EXISTS idx_api_sms_requests_key_created_at
  ON public.api_sms_requests(api_key_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_api_sms_dispatch(
  p_api_key_hash TEXT,
  p_idempotency_key TEXT,
  p_message TEXT,
  p_recipients TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key_id UUID;
  v_company_id UUID;
  v_company_plan TEXT;
  v_sender_id TEXT;
  v_request_id UUID;
  v_campaign_id UUID;
  v_segments INTEGER;
  v_units INTEGER;
  v_skipped INTEGER;
  v_messages JSONB;
  v_recipients TEXT[];
  v_existing_status TEXT;
  v_existing_response JSONB;
  v_per_minute_limit INTEGER;
  v_daily_limit INTEGER;
  v_requests_last_minute INTEGER;
  v_requests_today INTEGER;
BEGIN
  IF p_api_key_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid API key'; END IF;
  IF length(trim(p_idempotency_key)) < 8 OR length(trim(p_idempotency_key)) > 120 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN RAISE EXCEPTION 'Message must contain 1 to 612 characters'; END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN RAISE EXCEPTION 'Recipient count must be between 1 and 1000'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN RAISE EXCEPTION 'Invalid recipient phone number'; END IF;

  SELECT api_key.id, api_key.company_id, company.plan, setting.sender_header
  INTO v_api_key_id, v_company_id, v_company_plan, v_sender_id
  FROM public.customer_api_keys api_key
  JOIN public.companies company ON company.id = api_key.company_id
  JOIN public.company_provider_settings setting ON setting.company_id = company.id
  WHERE api_key.key_hash = p_api_key_hash
    AND api_key.is_active = true
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active')
    AND company.plan IN ('professional', 'agency')
    AND setting.provider_name = 'netgsm'
    AND setting.is_active = true
    AND setting.usercode IS NOT NULL
    AND setting.encrypted_secret IS NOT NULL
    AND length(trim(setting.sender_header)) > 0;

  IF v_api_key_id IS NULL THEN RAISE EXCEPTION 'Invalid API key, inactive provider connection, or API feature not enabled for plan'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_api_key_id::TEXT, 0));

  SELECT status, response INTO v_existing_status, v_existing_response
  FROM public.api_sms_requests
  WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response);
  END IF;

  v_per_minute_limit := CASE v_company_plan
    WHEN 'agency' THEN 300
    WHEN 'professional' THEN 60
    ELSE 0
  END;
  v_daily_limit := CASE v_company_plan
    WHEN 'agency' THEN 100000
    WHEN 'professional' THEN 10000
    ELSE 0
  END;

  SELECT
    count(*) FILTER (WHERE request.created_at >= now() - interval '1 minute')::INTEGER,
    count(*) FILTER (WHERE request.created_at >= date_trunc('day', now()))::INTEGER
  INTO v_requests_last_minute, v_requests_today
  FROM public.api_sms_requests request
  WHERE request.api_key_id = v_api_key_id;

  IF v_requests_last_minute >= v_per_minute_limit THEN
    RAISE EXCEPTION 'API rate limit exceeded: minute limit reached';
  END IF;

  IF v_requests_today >= v_daily_limit THEN
    RAISE EXCEPTION 'API rate limit exceeded: daily limit reached';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT recipient FROM unnest(p_recipients) recipient
    WHERE NOT EXISTS (
      SELECT 1 FROM public.suppression_list suppression
      WHERE suppression.company_id = v_company_id AND suppression.phone = recipient
    )
  ) INTO v_recipients;
  v_skipped := cardinality(ARRAY(SELECT DISTINCT recipient FROM unnest(p_recipients) recipient)) - cardinality(v_recipients);
  IF cardinality(v_recipients) = 0 THEN RAISE EXCEPTION 'All recipients are suppressed'; END IF;

  INSERT INTO public.api_sms_requests(api_key_id, company_id, idempotency_key, status)
  VALUES (v_api_key_id, v_company_id, trim(p_idempotency_key), 'processing')
  ON CONFLICT (api_key_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_request_id;
  IF v_request_id IS NULL THEN
    SELECT status, response INTO v_existing_status, v_existing_response
    FROM public.api_sms_requests
    WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
    RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response);
  END IF;

  v_segments := public.sms_segment_count(p_message);
  v_units := cardinality(v_recipients) * v_segments;

  INSERT INTO public.sms_campaigns(company_id, name, message, total_recipients, skipped_recipients, status)
  VALUES (v_company_id, 'API SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), p_message, cardinality(v_recipients), v_skipped, 'sending')
  RETURNING id INTO v_campaign_id;

  WITH inserted AS (
    INSERT INTO public.sms_messages(company_id, campaign_id, sender_id, recipient, message, status, credits_cost)
    SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments
    FROM unnest(v_recipients) recipient
    RETURNING id, recipient
  )
  SELECT jsonb_agg(jsonb_build_object('id', id, 'recipient', recipient)) INTO v_messages
  FROM inserted;

  UPDATE public.api_sms_requests
  SET campaign_id = v_campaign_id, updated_at = now()
  WHERE id = v_request_id;

  UPDATE public.customer_api_keys
  SET last_used_at = now()
  WHERE id = v_api_key_id;

  RETURN jsonb_build_object(
    'created', true,
    'request_id', v_request_id,
    'campaign_id', v_campaign_id,
    'company_id', v_company_id,
    'sender_id', v_sender_id,
    'messages', v_messages,
    'estimated_provider_units', v_units,
    'skipped_recipients', v_skipped,
    'rate_limit', jsonb_build_object(
      'per_minute', v_per_minute_limit,
      'daily', v_daily_limit,
      'remaining_minute', greatest(v_per_minute_limit - v_requests_last_minute - 1, 0),
      'remaining_today', greatest(v_daily_limit - v_requests_today - 1, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO service_role;
