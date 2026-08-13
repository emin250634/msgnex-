-- API dispatch recovery for incomplete provider submissions.
-- API requests that may have reached the provider are never retried
-- automatically; they are moved to manual review instead.

ALTER TABLE public.api_sms_requests
  DROP CONSTRAINT IF EXISTS api_sms_requests_status_check;

ALTER TABLE public.api_sms_requests
  ADD CONSTRAINT api_sms_requests_status_check
  CHECK (status IN ('processing', 'completed', 'review_required'));

CREATE INDEX IF NOT EXISTS idx_api_sms_requests_stale_processing
  ON public.api_sms_requests(status, updated_at)
  WHERE status = 'processing';

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

  INSERT INTO public.sms_campaigns(
    company_id,
    name,
    message,
    total_recipients,
    skipped_recipients,
    status,
    processing_started_at
  )
  VALUES (
    v_company_id,
    'API SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    p_message,
    cardinality(v_recipients),
    v_skipped,
    'sending',
    now()
  )
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

CREATE OR REPLACE FUNCTION public.complete_api_sms_dispatch(
  p_api_key_hash TEXT,
  p_request_id UUID,
  p_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID;
  v_campaign_id UUID;
  v_total INTEGER;
  v_success INTEGER;
  v_failed INTEGER;
  v_pending INTEGER;
  v_provider_name TEXT;
  v_provider_bulk_id TEXT;
  v_provider_status_code TEXT;
  v_provider_status_text TEXT;
  v_response JSONB;
BEGIN
  SELECT request.company_id, request.campaign_id, campaign.total_recipients
  INTO v_company_id, v_campaign_id, v_total
  FROM public.api_sms_requests request
  JOIN public.customer_api_keys api_key ON api_key.id = request.api_key_id
  JOIN public.sms_campaigns campaign ON campaign.id = request.campaign_id
  WHERE request.id = p_request_id
    AND request.status = 'processing'
    AND campaign.status = 'sending'
    AND api_key.key_hash = p_api_key_hash
    AND api_key.is_active = true
  FOR UPDATE OF request, campaign;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'API dispatch not found or no longer processing'; END IF;

  WITH results AS (
    SELECT *
    FROM jsonb_to_recordset(p_results) AS result(
      id UUID,
      success BOOLEAN,
      accepted BOOLEAN,
      normalized_status TEXT,
      provider_name TEXT,
      provider_bulk_id TEXT,
      provider_message_id TEXT,
      provider_status_code TEXT,
      provider_status_text TEXT,
      error TEXT,
      raw_status JSONB
    )
  ), normalized AS (
    SELECT
      id,
      COALESCE(NULLIF(trim(provider_name), ''), 'unknown') AS provider_name,
      NULLIF(trim(provider_bulk_id), '') AS provider_bulk_id,
      NULLIF(trim(provider_message_id), '') AS provider_message_id,
      NULLIF(trim(provider_status_code), '') AS provider_status_code,
      NULLIF(trim(provider_status_text), '') AS provider_status_text,
      NULLIF(trim(error), '') AS error,
      raw_status,
      CASE
        WHEN normalized_status IN ('delivered', 'sent') THEN normalized_status
        WHEN normalized_status = 'failed' THEN 'failed'
        WHEN accepted IS TRUE THEN 'sent'
        WHEN success IS TRUE THEN 'sent'
        ELSE 'failed'
      END AS next_status
    FROM results
  )
  UPDATE public.sms_messages message
  SET status = normalized.next_status,
      provider_name = normalized.provider_name,
      provider_bulk_id = normalized.provider_bulk_id,
      provider_message_id = normalized.provider_message_id,
      provider_status_code = normalized.provider_status_code,
      provider_status_text = normalized.provider_status_text,
      provider_error = normalized.error,
      provider_raw_status = normalized.raw_status,
      accepted_at = CASE WHEN normalized.next_status IN ('sent', 'delivered') THEN COALESCE(message.accepted_at, now()) ELSE message.accepted_at END,
      sent_at = CASE WHEN normalized.next_status IN ('sent', 'delivered') THEN COALESCE(message.sent_at, now()) ELSE message.sent_at END,
      delivered_at = CASE WHEN normalized.next_status = 'delivered' THEN COALESCE(message.delivered_at, now()) ELSE message.delivered_at END,
      failed_at = CASE WHEN normalized.next_status = 'failed' THEN COALESCE(message.failed_at, now()) ELSE message.failed_at END,
      is_final = normalized.next_status IN ('delivered', 'failed')
  FROM normalized
  WHERE message.id = normalized.id
    AND message.company_id = v_company_id
    AND message.campaign_id = v_campaign_id
    AND message.status = 'pending';

  SELECT
    count(*) FILTER (WHERE status IN ('sent', 'delivered')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'sent' AND is_final = false),
    max(provider_name),
    max(provider_bulk_id),
    max(provider_status_code),
    max(provider_status_text)
  INTO v_success, v_failed, v_pending, v_provider_name, v_provider_bulk_id, v_provider_status_code, v_provider_status_text
  FROM public.sms_messages
  WHERE company_id = v_company_id
    AND campaign_id = v_campaign_id;

  IF v_success + v_failed <> v_total THEN RAISE EXCEPTION 'Incomplete provider result set'; END IF;

  UPDATE public.sms_campaigns
  SET success_count = v_success,
      fail_count = v_failed,
      status = CASE WHEN v_success > 0 THEN 'completed' ELSE 'failed' END,
      provider_name = v_provider_name,
      provider_bulk_id = v_provider_bulk_id,
      provider_status = CASE WHEN v_success > 0 THEN 'awaiting_dlr' ELSE 'failed' END,
      provider_status_code = v_provider_status_code,
      provider_status_text = v_provider_status_text,
      provider_raw_response = p_results,
      provider_submitted_at = COALESCE(provider_submitted_at, now()),
      provider_success_count = v_success,
      provider_failed_count = v_failed,
      provider_pending_count = v_pending,
      sent_at = now(),
      updated_at = now()
  WHERE id = v_campaign_id
    AND status = 'sending';

  v_response := jsonb_build_object(
    'campaignId', v_campaign_id,
    'success', v_success,
    'fail', v_failed,
    'pending', v_pending,
    'provider', v_provider_name,
    'providerBulkId', v_provider_bulk_id
  );

  UPDATE public.api_sms_requests
  SET status = 'completed', response = v_response, updated_at = now()
  WHERE id = p_request_id
    AND status = 'processing';

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_stale_sending_campaigns(
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_timeout_minutes < 5 OR p_timeout_minutes > 1440 THEN
    RAISE EXCEPTION 'Timeout must be between 5 and 1440 minutes';
  END IF;

  WITH stale AS (
    UPDATE public.sms_campaigns campaign
    SET status = 'review_required',
        review_reason = 'Worker timeout. Provider delivery state must be checked before refund or retry.',
        updated_at = now()
    WHERE campaign.status = 'sending'
      AND campaign.processing_started_at < now() - make_interval(mins => p_timeout_minutes)
      AND NOT EXISTS (
        SELECT 1
        FROM public.api_sms_requests request
        WHERE request.campaign_id = campaign.id
          AND request.status = 'processing'
      )
    RETURNING campaign.id
  )
  SELECT count(*) INTO v_count FROM stale;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_stale_api_sms_dispatches(
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_timeout_minutes < 5 OR p_timeout_minutes > 1440 THEN
    RAISE EXCEPTION 'Timeout must be between 5 and 1440 minutes';
  END IF;

  WITH stale AS (
    SELECT
      request.id AS request_id,
      request.company_id,
      request.campaign_id,
      request.idempotency_key,
      request.created_at,
      campaign.processing_started_at
    FROM public.api_sms_requests request
    JOIN public.sms_campaigns campaign ON campaign.id = request.campaign_id
    WHERE request.status = 'processing'
      AND campaign.status = 'sending'
      AND campaign.processing_started_at IS NOT NULL
      AND campaign.processing_started_at < now() - make_interval(mins => p_timeout_minutes)
    FOR UPDATE OF request, campaign SKIP LOCKED
  ), updated_campaigns AS (
    UPDATE public.sms_campaigns campaign
    SET status = 'review_required',
        review_reason = 'API dispatch timeout. Provider delivery state is unknown and must be checked before retry or refund.',
        updated_at = now()
    FROM stale
    WHERE campaign.id = stale.campaign_id
      AND campaign.status = 'sending'
    RETURNING campaign.id
  ), updated_requests AS (
    UPDATE public.api_sms_requests request
    SET status = 'review_required',
        response = jsonb_build_object(
          'errorCode', 'DISPATCH_REVIEW_REQUIRED',
          'message', 'Provider delivery state is unknown and requires manual review.',
          'campaignId', stale.campaign_id
        ),
        updated_at = now()
    FROM stale
    WHERE request.id = stale.request_id
      AND request.status = 'processing'
    RETURNING request.id, request.company_id, request.campaign_id, request.idempotency_key, request.created_at
  ), audit AS (
    INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
    SELECT
      NULL,
      'worker',
      'api.dispatch_review_required',
      'api_sms_request',
      updated_requests.id,
      updated_requests.company_id,
      jsonb_build_object(
        'campaign_id', updated_requests.campaign_id,
        'idempotency_key', updated_requests.idempotency_key,
        'request_created_at', updated_requests.created_at,
        'timeout_minutes', p_timeout_minutes,
        'reason', 'provider_delivery_state_unknown'
      )
    FROM updated_requests
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated_requests;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.flag_stale_api_sms_dispatches(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_stale_api_sms_dispatches(INTEGER) TO service_role;
