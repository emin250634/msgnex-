-- Bill SMS messages by segment count instead of recipient count.
-- GSM-7: 160 chars for one segment, 153 per concatenated segment.
-- Unicode: 70 chars for one segment, 67 per concatenated segment.

CREATE OR REPLACE FUNCTION public.sms_segment_count(p_message TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_character TEXT;
  v_gsm_units INTEGER := 0;
  v_unicode_units INTEGER := 0;
  v_is_gsm7 BOOLEAN := true;
  v_basic TEXT := '@' || chr(163) || '$' || chr(165) || chr(232) || chr(233) ||
    chr(249) || chr(236) || chr(242) || chr(199) || chr(10) || chr(216) ||
    chr(248) || chr(13) || chr(197) || chr(229) || chr(916) || '_' || chr(934) ||
    chr(915) || chr(923) || chr(937) || chr(928) || chr(936) || chr(931) ||
    chr(920) || chr(926) || ' !"#' || chr(164) ||
    '%&''()*+,-./0123456789:;<=>?' || chr(161) ||
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || chr(196) || chr(214) || chr(209) || chr(220) ||
    chr(167) || chr(191) || 'abcdefghijklmnopqrstuvwxyz' || chr(228) || chr(246) ||
    chr(241) || chr(252) || chr(224);
  v_extended TEXT := '^{}\[~]|' || chr(8364);
BEGIN
  IF p_message IS NULL OR length(p_message) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_character IN SELECT regexp_split_to_table(p_message, '')
  LOOP
    v_unicode_units := v_unicode_units + 1;
    IF position(v_character IN v_basic) > 0 THEN
      v_gsm_units := v_gsm_units + 1;
    ELSIF position(v_character IN v_extended) > 0 THEN
      v_gsm_units := v_gsm_units + 2;
    ELSE
      v_is_gsm7 := false;
    END IF;
  END LOOP;

  IF v_is_gsm7 THEN
    RETURN CASE WHEN v_gsm_units <= 160 THEN 1 ELSE ceil(v_gsm_units / 153.0)::INTEGER END;
  END IF;

  RETURN CASE WHEN v_unicode_units <= 70 THEN 1 ELSE ceil(v_unicode_units / 67.0)::INTEGER END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sms_dispatch(
  p_message TEXT,
  p_recipients TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_sender_id TEXT;
  v_campaign_id UUID;
  v_segments INTEGER;
  v_cost INTEGER;
  v_messages JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN
    RAISE EXCEPTION 'Message must contain 1 to 612 characters';
  END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN
    RAISE EXCEPTION 'Recipient count must be between 1 and 1000';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) AS recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN
    RAISE EXCEPTION 'Invalid recipient phone number';
  END IF;

  SELECT profile.company_id, company.sender_name
  INTO v_company_id, v_sender_id
  FROM public.profiles profile
  JOIN public.companies company ON company.id = profile.company_id
  WHERE profile.id = v_user_id
    AND profile.role = 'customer'
    AND profile.is_active = true
    AND company.is_active = true
    AND company.sender_approved = true
    AND length(trim(company.sender_name)) > 0;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Active company and approved sender ID required'; END IF;

  v_segments := public.sms_segment_count(p_message);
  v_cost := cardinality(p_recipients) * v_segments;

  UPDATE public.sms_credits SET balance = balance - v_cost, updated_at = now()
  WHERE company_id = v_company_id AND balance >= v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  INSERT INTO public.sms_campaigns (company_id, name, message, total_recipients, status)
  VALUES (v_company_id, 'Transactional SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), p_message, cardinality(p_recipients), 'sending')
  RETURNING id INTO v_campaign_id;

  WITH inserted AS (
    INSERT INTO public.sms_messages (company_id, campaign_id, sender_id, recipient, message, status, credits_cost)
    SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments
    FROM unnest(p_recipients) AS recipient
    RETURNING id, recipient
  )
  SELECT jsonb_agg(jsonb_build_object('id', id, 'recipient', recipient)) INTO v_messages FROM inserted;

  INSERT INTO public.credit_transactions (company_id, amount, type, note, created_by)
  VALUES (v_company_id, -v_cost, 'deduct', 'SMS credit reservation (' || v_cost || ' credits)', v_user_id);

  RETURN jsonb_build_object('campaign_id', v_campaign_id, 'sender_id', v_sender_id, 'segments', v_segments, 'reserved_credits', v_cost, 'messages', v_messages);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_sms_dispatch(p_campaign_id UUID, p_results JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_total INTEGER;
  v_success INTEGER;
  v_failed INTEGER;
  v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT campaign.company_id, campaign.total_recipients INTO v_company_id, v_total
  FROM public.sms_campaigns campaign
  JOIN public.profiles profile ON profile.company_id = campaign.company_id
  WHERE campaign.id = p_campaign_id AND campaign.status = 'sending'
    AND profile.id = v_user_id AND profile.role = 'customer';
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Dispatch not found'; END IF;

  WITH results AS (
    SELECT * FROM jsonb_to_recordset(p_results) AS result(id UUID, success BOOLEAN, provider_message_id TEXT, error TEXT)
  )
  UPDATE public.sms_messages message
  SET status = CASE WHEN result.success THEN 'sent' ELSE 'failed' END,
      provider_message_id = result.provider_message_id, provider_error = result.error,
      sent_at = CASE WHEN result.success THEN now() ELSE NULL END
  FROM results result
  WHERE message.id = result.id AND message.company_id = v_company_id
    AND message.campaign_id = p_campaign_id AND message.status = 'pending';

  SELECT count(*) FILTER (WHERE status = 'sent'), count(*) FILTER (WHERE status = 'failed'),
         COALESCE(sum(credits_cost) FILTER (WHERE status = 'failed'), 0)
  INTO v_success, v_failed, v_refund
  FROM public.sms_messages WHERE company_id = v_company_id AND campaign_id = p_campaign_id;
  IF v_success + v_failed <> v_total THEN RAISE EXCEPTION 'Incomplete provider result set'; END IF;

  IF v_refund > 0 THEN
    UPDATE public.sms_credits SET balance = balance + v_refund, updated_at = now()
    WHERE company_id = v_company_id RETURNING balance INTO v_balance;
    INSERT INTO public.credit_transactions (company_id, amount, type, note, created_by)
    VALUES (v_company_id, v_refund, 'refund', 'Failed SMS refund (' || v_refund || ' credits)', v_user_id);
  ELSE
    SELECT balance INTO v_balance FROM public.sms_credits WHERE company_id = v_company_id;
  END IF;

  UPDATE public.sms_campaigns SET success_count = v_success, fail_count = v_failed,
    status = CASE WHEN v_success > 0 THEN 'completed' ELSE 'failed' END, sent_at = now(), updated_at = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object('success', v_success, 'fail', v_failed, 'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_api_sms_dispatch(
  p_api_key_hash TEXT, p_idempotency_key TEXT, p_message TEXT, p_recipients TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key_id UUID; v_company_id UUID; v_sender_id TEXT; v_request_id UUID;
  v_campaign_id UUID; v_segments INTEGER; v_cost INTEGER; v_messages JSONB;
  v_existing_status TEXT; v_existing_response JSONB;
BEGIN
  IF p_api_key_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid API key'; END IF;
  IF length(trim(p_idempotency_key)) < 8 OR length(trim(p_idempotency_key)) > 120 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN RAISE EXCEPTION 'Message must contain 1 to 612 characters'; END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN RAISE EXCEPTION 'Recipient count must be between 1 and 1000'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) AS recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN RAISE EXCEPTION 'Invalid recipient phone number'; END IF;

  SELECT api_key.id, api_key.company_id, company.sender_name INTO v_api_key_id, v_company_id, v_sender_id
  FROM public.customer_api_keys api_key JOIN public.companies company ON company.id = api_key.company_id
  WHERE api_key.key_hash = p_api_key_hash AND api_key.is_active = true AND company.is_active = true
    AND company.sender_approved = true AND length(trim(company.sender_name)) > 0;
  IF v_api_key_id IS NULL THEN RAISE EXCEPTION 'Invalid API key or inactive company'; END IF;

  SELECT status, response INTO v_existing_status, v_existing_response FROM public.api_sms_requests
  WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
  IF v_existing_status IS NOT NULL THEN RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response); END IF;

  INSERT INTO public.api_sms_requests (api_key_id, company_id, idempotency_key, status)
  VALUES (v_api_key_id, v_company_id, trim(p_idempotency_key), 'processing')
  ON CONFLICT (api_key_id, idempotency_key) DO NOTHING RETURNING id INTO v_request_id;
  IF v_request_id IS NULL THEN
    SELECT status, response INTO v_existing_status, v_existing_response FROM public.api_sms_requests
    WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
    RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response);
  END IF;

  v_segments := public.sms_segment_count(p_message);
  v_cost := cardinality(p_recipients) * v_segments;
  UPDATE public.sms_credits SET balance = balance - v_cost, updated_at = now()
  WHERE company_id = v_company_id AND balance >= v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  INSERT INTO public.sms_campaigns (company_id, name, message, total_recipients, status)
  VALUES (v_company_id, 'API SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), p_message, cardinality(p_recipients), 'sending')
  RETURNING id INTO v_campaign_id;

  WITH inserted AS (
    INSERT INTO public.sms_messages (company_id, campaign_id, sender_id, recipient, message, status, credits_cost)
    SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments FROM unnest(p_recipients) AS recipient
    RETURNING id, recipient
  )
  SELECT jsonb_agg(jsonb_build_object('id', id, 'recipient', recipient)) INTO v_messages FROM inserted;

  INSERT INTO public.credit_transactions (company_id, amount, type, note)
  VALUES (v_company_id, -v_cost, 'deduct', 'API SMS credit reservation (' || v_cost || ' credits)');
  UPDATE public.api_sms_requests SET campaign_id = v_campaign_id, updated_at = now() WHERE id = v_request_id;
  UPDATE public.customer_api_keys SET last_used_at = now() WHERE id = v_api_key_id;
  RETURN jsonb_build_object('created', true, 'request_id', v_request_id, 'campaign_id', v_campaign_id, 'sender_id', v_sender_id, 'segments', v_segments, 'messages', v_messages);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_api_sms_dispatch(p_api_key_hash TEXT, p_request_id UUID, p_results JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID; v_campaign_id UUID; v_total INTEGER; v_success INTEGER;
  v_failed INTEGER; v_refund INTEGER; v_balance INTEGER; v_response JSONB;
BEGIN
  SELECT request.company_id, request.campaign_id, campaign.total_recipients INTO v_company_id, v_campaign_id, v_total
  FROM public.api_sms_requests request JOIN public.customer_api_keys api_key ON api_key.id = request.api_key_id
  JOIN public.sms_campaigns campaign ON campaign.id = request.campaign_id
  WHERE request.id = p_request_id AND request.status = 'processing' AND api_key.key_hash = p_api_key_hash AND api_key.is_active = true;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'API dispatch not found'; END IF;

  WITH results AS (
    SELECT * FROM jsonb_to_recordset(p_results) AS result(id UUID, success BOOLEAN, provider_message_id TEXT, error TEXT)
  )
  UPDATE public.sms_messages message SET status = CASE WHEN result.success THEN 'sent' ELSE 'failed' END,
    provider_message_id = result.provider_message_id, provider_error = result.error,
    sent_at = CASE WHEN result.success THEN now() ELSE NULL END
  FROM results result WHERE message.id = result.id AND message.company_id = v_company_id
    AND message.campaign_id = v_campaign_id AND message.status = 'pending';

  SELECT count(*) FILTER (WHERE status = 'sent'), count(*) FILTER (WHERE status = 'failed'),
    COALESCE(sum(credits_cost) FILTER (WHERE status = 'failed'), 0)
  INTO v_success, v_failed, v_refund FROM public.sms_messages WHERE company_id = v_company_id AND campaign_id = v_campaign_id;
  IF v_success + v_failed <> v_total THEN RAISE EXCEPTION 'Incomplete provider result set'; END IF;

  IF v_refund > 0 THEN
    UPDATE public.sms_credits SET balance = balance + v_refund, updated_at = now() WHERE company_id = v_company_id RETURNING balance INTO v_balance;
    INSERT INTO public.credit_transactions (company_id, amount, type, note)
    VALUES (v_company_id, v_refund, 'refund', 'Failed API SMS refund (' || v_refund || ' credits)');
  ELSE
    SELECT balance INTO v_balance FROM public.sms_credits WHERE company_id = v_company_id;
  END IF;

  UPDATE public.sms_campaigns SET success_count = v_success, fail_count = v_failed,
    status = CASE WHEN v_success > 0 THEN 'completed' ELSE 'failed' END, sent_at = now(), updated_at = now() WHERE id = v_campaign_id;
  v_response := jsonb_build_object('campaignId', v_campaign_id, 'success', v_success, 'fail', v_failed, 'balance', v_balance);
  UPDATE public.api_sms_requests SET status = 'completed', response = v_response, updated_at = now() WHERE id = p_request_id;
  RETURN v_response;
END;
$$;
