-- ============================================================
-- MSGNEX - BYO provider pivot
-- Firms use their own provider accounts. MSGNEX no longer reserves,
-- deducts, allocates, or refunds internal SMS credits in active flows.
-- Historical credit tables remain in place for old data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_sms_campaign(p_message TEXT, p_recipients TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_sender_id TEXT;
  v_campaign_id UUID;
  v_segments INTEGER;
  v_units INTEGER;
  v_skipped INTEGER;
  v_recipients TEXT[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN
    RAISE EXCEPTION 'Message must contain 1 to 612 characters';
  END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN
    RAISE EXCEPTION 'Recipient count must be between 1 and 1000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_recipients) recipient
    WHERE recipient !~ '^[0-9]{10,15}$'
  ) THEN
    RAISE EXCEPTION 'Invalid recipient phone number';
  END IF;

  SELECT setting.sender_header INTO v_sender_id
  FROM public.company_provider_settings setting
  JOIN public.companies company ON company.id = setting.company_id
  WHERE setting.company_id = v_company_id
    AND setting.provider_name = 'netgsm'
    AND setting.is_active = true
    AND setting.usercode IS NOT NULL
    AND setting.encrypted_secret IS NOT NULL
    AND length(trim(setting.sender_header)) > 0
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active');

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Active company provider connection required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT recipient
    FROM unnest(p_recipients) recipient
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.suppression_list suppression
      WHERE suppression.company_id = v_company_id
        AND suppression.phone = recipient
    )
  ) INTO v_recipients;

  v_skipped := cardinality(ARRAY(
    SELECT DISTINCT recipient FROM unnest(p_recipients) recipient
  )) - cardinality(v_recipients);

  IF cardinality(v_recipients) = 0 THEN RAISE EXCEPTION 'All recipients are suppressed'; END IF;

  v_segments := public.sms_segment_count(p_message);
  v_units := cardinality(v_recipients) * v_segments;

  INSERT INTO public.sms_campaigns(
    company_id, name, message, total_recipients, skipped_recipients, status, queued_at
  )
  VALUES (
    v_company_id,
    'Panel SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    p_message,
    cardinality(v_recipients),
    v_skipped,
    'queued',
    now()
  )
  RETURNING id INTO v_campaign_id;

  INSERT INTO public.sms_messages(
    company_id, campaign_id, sender_id, recipient, message, status, credits_cost
  )
  SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments
  FROM unnest(v_recipients) recipient;

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'segments', v_segments,
    'estimated_provider_units', v_units,
    'skipped_recipients', v_skipped
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_queued_sms_campaign(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_cancelled INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT campaign.company_id INTO v_company_id
  FROM public.sms_campaigns campaign
  WHERE campaign.id = p_campaign_id
    AND campaign.status = 'queued'
    AND public.is_company_admin_or_owner(campaign.company_id)
  FOR UPDATE OF campaign;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Only authorized queued campaigns can be cancelled'; END IF;

  UPDATE public.sms_messages
  SET status = 'failed',
      provider_error = 'Campaign cancelled before provider submit',
      failed_at = now(),
      is_final = true
  WHERE company_id = v_company_id
    AND campaign_id = p_campaign_id
    AND status = 'pending';

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.sms_campaigns
  SET status = 'cancelled',
      cancelled_at = now(),
      fail_count = v_cancelled,
      updated_at = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'status', 'cancelled',
    'cancelledMessages', v_cancelled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_queued_sms_campaign(
  p_campaign_id UUID,
  p_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID;
  v_total INTEGER;
  v_success INTEGER;
  v_failed INTEGER;
  v_pending INTEGER;
  v_provider_name TEXT;
  v_provider_bulk_id TEXT;
  v_provider_status_code TEXT;
  v_provider_status_text TEXT;
  v_campaign_status TEXT;
  v_provider_status TEXT;
BEGIN
  SELECT company_id, total_recipients
  INTO v_company_id, v_total
  FROM public.sms_campaigns
  WHERE id = p_campaign_id
    AND status = 'sending';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Queued campaign not found';
  END IF;

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
    AND message.campaign_id = p_campaign_id
    AND message.status = 'pending';

  SELECT
    count(*) FILTER (WHERE status IN ('sent', 'delivered')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'sent' AND is_final = false),
    max(provider_name),
    max(provider_bulk_id),
    max(provider_status_code),
    max(provider_status_text)
  INTO
    v_success,
    v_failed,
    v_pending,
    v_provider_name,
    v_provider_bulk_id,
    v_provider_status_code,
    v_provider_status_text
  FROM public.sms_messages
  WHERE company_id = v_company_id
    AND campaign_id = p_campaign_id;

  IF v_success + v_failed <> v_total THEN
    RAISE EXCEPTION 'Incomplete provider result set';
  END IF;

  v_campaign_status := CASE WHEN v_success > 0 THEN 'completed' ELSE 'failed' END;
  v_provider_status := CASE
    WHEN v_success > 0 AND v_failed > 0 THEN 'partially_submitted'
    WHEN v_pending > 0 THEN 'awaiting_dlr'
    WHEN v_success > 0 THEN 'awaiting_dlr'
    ELSE 'failed'
  END;

  UPDATE public.sms_campaigns
  SET success_count = v_success,
      fail_count = v_failed,
      status = v_campaign_status,
      provider_name = v_provider_name,
      provider_bulk_id = v_provider_bulk_id,
      provider_status = v_provider_status,
      provider_status_code = v_provider_status_code,
      provider_status_text = v_provider_status_text,
      provider_raw_response = p_results,
      provider_submitted_at = COALESCE(provider_submitted_at, now()),
      provider_success_count = v_success,
      provider_failed_count = v_failed,
      provider_pending_count = v_pending,
      sent_at = now(),
      updated_at = now()
  WHERE id = p_campaign_id;

  INSERT INTO public.sms_provider_dispatches (
    campaign_id, company_id, provider_name, provider_bulk_id, response_payload,
    status, provider_status_code, provider_status_text, submitted_at, completed_at
  )
  VALUES (
    p_campaign_id, v_company_id, COALESCE(v_provider_name, 'unknown'), v_provider_bulk_id,
    p_results, CASE WHEN v_success > 0 THEN 'awaiting_dlr' ELSE 'failed' END,
    v_provider_status_code, v_provider_status_text, now(),
    CASE WHEN v_success > 0 THEN NULL ELSE now() END
  );

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'status', v_campaign_status,
    'providerStatus', v_provider_status,
    'success', v_success,
    'fail', v_failed,
    'pending', v_pending,
    'provider', v_provider_name,
    'providerBulkId', v_provider_bulk_id
  );
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
BEGIN
  IF p_api_key_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid API key'; END IF;
  IF length(trim(p_idempotency_key)) < 8 OR length(trim(p_idempotency_key)) > 120 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN RAISE EXCEPTION 'Message must contain 1 to 612 characters'; END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN RAISE EXCEPTION 'Recipient count must be between 1 and 1000'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN RAISE EXCEPTION 'Invalid recipient phone number'; END IF;

  SELECT api_key.id, api_key.company_id, setting.sender_header
  INTO v_api_key_id, v_company_id, v_sender_id
  FROM public.customer_api_keys api_key
  JOIN public.companies company ON company.id = api_key.company_id
  JOIN public.company_provider_settings setting ON setting.company_id = company.id
  WHERE api_key.key_hash = p_api_key_hash
    AND api_key.is_active = true
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active')
    AND setting.provider_name = 'netgsm'
    AND setting.is_active = true
    AND setting.usercode IS NOT NULL
    AND setting.encrypted_secret IS NOT NULL
    AND length(trim(setting.sender_header)) > 0;

  IF v_api_key_id IS NULL THEN RAISE EXCEPTION 'Invalid API key or inactive provider connection'; END IF;

  SELECT status, response INTO v_existing_status, v_existing_response
  FROM public.api_sms_requests
  WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response);
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
    'skipped_recipients', v_skipped
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
    AND api_key.key_hash = p_api_key_hash
    AND api_key.is_active = true;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'API dispatch not found'; END IF;

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
  WHERE id = v_campaign_id;

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
  WHERE id = p_request_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_sms_campaign(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_queued_sms_campaign(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_queued_sms_campaign(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.queue_sms_campaign(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queued_sms_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_queued_sms_campaign(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) TO service_role;
