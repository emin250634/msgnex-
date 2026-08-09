-- Adds audit logging for API key lifecycle and API rate limit events.
-- API secrets, raw API keys, message bodies, and recipient lists are not stored in audit metadata.

CREATE OR REPLACE FUNCTION public.create_customer_api_key(
  p_name TEXT,
  p_key_prefix TEXT,
  p_key_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_key_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF NOT public.company_has_feature(v_company_id, 'api_access') THEN
    RAISE EXCEPTION 'API access requires Professional or Agency plan';
  END IF;
  IF length(trim(p_name)) < 2 OR length(trim(p_name)) > 80 THEN RAISE EXCEPTION 'Invalid API key name'; END IF;
  IF p_key_prefix !~ '^mnx_[A-Za-z0-9_-]{6,20}$' OR p_key_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid API key format';
  END IF;

  INSERT INTO public.customer_api_keys (company_id, name, key_prefix, key_hash, created_by)
  VALUES (v_company_id, trim(p_name), p_key_prefix, p_key_hash, v_user_id)
  RETURNING id INTO v_key_id;

  INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
  VALUES (
    v_user_id,
    'customer',
    'api_key.created',
    'customer_api_key',
    v_key_id,
    v_company_id,
    jsonb_build_object('name', trim(p_name), 'key_prefix', p_key_prefix)
  );

  RETURN v_key_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_customer_api_key(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_key_name TEXT;
  v_key_prefix TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;

  UPDATE public.customer_api_keys api_key
  SET is_active = false, revoked_at = now()
  WHERE api_key.id = p_key_id
    AND api_key.company_id = v_company_id
    AND api_key.is_active = true
  RETURNING api_key.name, api_key.key_prefix
  INTO v_key_name, v_key_prefix;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
  VALUES (
    v_user_id,
    'customer',
    'api_key.revoked',
    'customer_api_key',
    p_key_id,
    v_company_id,
    jsonb_build_object('name', v_key_name, 'key_prefix', v_key_prefix)
  );

  RETURN true;
END;
$$;

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
    INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
    VALUES (
      NULL,
      'api',
      'api.rate_limited',
      'customer_api_key',
      v_api_key_id,
      v_company_id,
      jsonb_build_object(
        'scope', 'minute',
        'plan', v_company_plan,
        'limit', v_per_minute_limit,
        'requests_last_minute', v_requests_last_minute
      )
    );

    RETURN jsonb_build_object(
      'created', false,
      'rate_limited', true,
      'scope', 'minute',
      'retry_after_seconds', 60,
      'message', 'API rate limit exceeded: minute limit reached'
    );
  END IF;

  IF v_requests_today >= v_daily_limit THEN
    INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
    VALUES (
      NULL,
      'api',
      'api.rate_limited',
      'customer_api_key',
      v_api_key_id,
      v_company_id,
      jsonb_build_object(
        'scope', 'daily',
        'plan', v_company_plan,
        'limit', v_daily_limit,
        'requests_today', v_requests_today
      )
    );

    RETURN jsonb_build_object(
      'created', false,
      'rate_limited', true,
      'scope', 'daily',
      'retry_after_seconds', 3600,
      'message', 'API rate limit exceeded: daily limit reached'
    );
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

REVOKE ALL ON FUNCTION public.create_customer_api_key(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_customer_api_key(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_customer_api_key(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_customer_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO service_role;
