-- Company-level suppression list. Suppressed recipients are filtered before
-- credits are reserved so customers are never charged for skipped numbers.

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS skipped_recipients INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS suppression_list_company_created_idx
  ON public.suppression_list(company_id, created_at DESC);

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppression_list_admin_all ON public.suppression_list;
CREATE POLICY suppression_list_admin_all ON public.suppression_list
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS suppression_list_customer_select ON public.suppression_list;
CREATE POLICY suppression_list_customer_select ON public.suppression_list
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());

CREATE OR REPLACE FUNCTION public.normalize_tr_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) = 11 AND left(v_phone, 1) = '0' THEN
    v_phone := '90' || substring(v_phone FROM 2);
  ELSIF length(v_phone) = 10 THEN
    v_phone := '90' || v_phone;
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN RETURN NULL; END IF;
  RETURN v_phone;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_suppression_entry(p_phone TEXT, p_reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_phone TEXT;
  v_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles
  WHERE id = v_user_id AND role = 'customer' AND is_active = true;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Active customer company required'; END IF;
  v_phone := public.normalize_tr_phone(p_phone);
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Invalid phone number'; END IF;
  INSERT INTO public.suppression_list(company_id, phone, reason, created_by)
  VALUES (v_company_id, v_phone, NULLIF(trim(p_reason), ''), v_user_id)
  ON CONFLICT (company_id, phone)
  DO UPDATE SET reason = COALESCE(EXCLUDED.reason, public.suppression_list.reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_suppression_entries(p_phones TEXT[], p_reason TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_count INTEGER;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles
  WHERE id = v_user_id AND role = 'customer' AND is_active = true;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Active customer company required'; END IF;
  WITH normalized AS (
    SELECT DISTINCT public.normalize_tr_phone(phone) AS phone
    FROM unnest(COALESCE(p_phones, ARRAY[]::TEXT[])) AS phone
  ), inserted AS (
    INSERT INTO public.suppression_list(company_id, phone, reason, created_by)
    SELECT v_company_id, phone, NULLIF(trim(p_reason), ''), v_user_id
    FROM normalized WHERE phone IS NOT NULL
    ON CONFLICT (company_id, phone)
    DO UPDATE SET reason = COALESCE(EXCLUDED.reason, public.suppression_list.reason)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_suppression_entry(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles
  WHERE id = v_user_id AND role = 'customer' AND is_active = true;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Active customer company required'; END IF;
  DELETE FROM public.suppression_list WHERE id = p_id AND company_id = v_company_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_sms_campaign(p_message TEXT, p_recipients TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID; v_sender_id TEXT; v_campaign_id UUID;
  v_segments INTEGER; v_cost INTEGER; v_skipped INTEGER;
  v_recipients TEXT[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN RAISE EXCEPTION 'Message must contain 1 to 612 characters'; END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN RAISE EXCEPTION 'Recipient count must be between 1 and 1000'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN RAISE EXCEPTION 'Invalid recipient phone number'; END IF;

  SELECT profile.company_id, company.sender_name INTO v_company_id, v_sender_id
  FROM public.profiles profile JOIN public.companies company ON company.id = profile.company_id
  WHERE profile.id = v_user_id AND profile.role = 'customer' AND profile.is_active = true
    AND company.is_active = true AND company.sender_approved = true AND length(trim(company.sender_name)) > 0;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Active company and approved sender ID required'; END IF;

  SELECT ARRAY(
    SELECT DISTINCT recipient FROM unnest(p_recipients) recipient
    WHERE NOT EXISTS (
      SELECT 1 FROM public.suppression_list suppression
      WHERE suppression.company_id = v_company_id AND suppression.phone = recipient
    )
  ) INTO v_recipients;
  v_skipped := cardinality(ARRAY(SELECT DISTINCT recipient FROM unnest(p_recipients) recipient)) - cardinality(v_recipients);
  IF cardinality(v_recipients) = 0 THEN RAISE EXCEPTION 'All recipients are suppressed'; END IF;

  v_segments := public.sms_segment_count(p_message);
  v_cost := cardinality(v_recipients) * v_segments;
  UPDATE public.sms_credits SET balance = balance - v_cost, updated_at = now()
  WHERE company_id = v_company_id AND balance >= v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  INSERT INTO public.sms_campaigns(company_id, name, message, total_recipients, skipped_recipients, status, queued_at)
  VALUES (v_company_id, 'Panel SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), p_message, cardinality(v_recipients), v_skipped, 'queued', now())
  RETURNING id INTO v_campaign_id;
  INSERT INTO public.sms_messages(company_id, campaign_id, sender_id, recipient, message, status, credits_cost)
  SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments FROM unnest(v_recipients) recipient;
  INSERT INTO public.credit_transactions(company_id, amount, type, note, created_by)
  VALUES (v_company_id, -v_cost, 'deduct', 'Queued SMS credit reservation (' || v_cost || ' credits)', v_user_id);
  RETURN jsonb_build_object('campaign_id', v_campaign_id, 'segments', v_segments, 'reserved_credits', v_cost,
    'skipped_recipients', v_skipped, 'balance', (SELECT balance FROM public.sms_credits WHERE company_id = v_company_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_api_sms_dispatch(p_api_key_hash TEXT, p_idempotency_key TEXT, p_message TEXT, p_recipients TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key_id UUID; v_company_id UUID; v_sender_id TEXT; v_request_id UUID; v_campaign_id UUID;
  v_segments INTEGER; v_cost INTEGER; v_skipped INTEGER; v_messages JSONB; v_recipients TEXT[];
  v_existing_status TEXT; v_existing_response JSONB;
BEGIN
  IF p_api_key_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid API key'; END IF;
  IF length(trim(p_idempotency_key)) < 8 OR length(trim(p_idempotency_key)) > 120 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN RAISE EXCEPTION 'Message must contain 1 to 612 characters'; END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN RAISE EXCEPTION 'Recipient count must be between 1 and 1000'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN RAISE EXCEPTION 'Invalid recipient phone number'; END IF;
  SELECT api_key.id, api_key.company_id, company.sender_name INTO v_api_key_id, v_company_id, v_sender_id
  FROM public.customer_api_keys api_key JOIN public.companies company ON company.id = api_key.company_id
  WHERE api_key.key_hash = p_api_key_hash AND api_key.is_active = true AND company.is_active = true
    AND company.sender_approved = true AND length(trim(company.sender_name)) > 0;
  IF v_api_key_id IS NULL THEN RAISE EXCEPTION 'Invalid API key or inactive company'; END IF;
  SELECT status, response INTO v_existing_status, v_existing_response FROM public.api_sms_requests
  WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
  IF v_existing_status IS NOT NULL THEN RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response); END IF;

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
  ON CONFLICT (api_key_id, idempotency_key) DO NOTHING RETURNING id INTO v_request_id;
  IF v_request_id IS NULL THEN
    SELECT status, response INTO v_existing_status, v_existing_response FROM public.api_sms_requests
    WHERE api_key_id = v_api_key_id AND idempotency_key = trim(p_idempotency_key);
    RETURN jsonb_build_object('created', false, 'status', v_existing_status, 'response', v_existing_response);
  END IF;
  v_segments := public.sms_segment_count(p_message); v_cost := cardinality(v_recipients) * v_segments;
  UPDATE public.sms_credits SET balance = balance - v_cost, updated_at = now() WHERE company_id = v_company_id AND balance >= v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credits'; END IF;
  INSERT INTO public.sms_campaigns(company_id, name, message, total_recipients, skipped_recipients, status)
  VALUES (v_company_id, 'API SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), p_message, cardinality(v_recipients), v_skipped, 'sending')
  RETURNING id INTO v_campaign_id;
  WITH inserted AS (
    INSERT INTO public.sms_messages(company_id, campaign_id, sender_id, recipient, message, status, credits_cost)
    SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments FROM unnest(v_recipients) recipient
    RETURNING id, recipient
  ) SELECT jsonb_agg(jsonb_build_object('id', id, 'recipient', recipient)) INTO v_messages FROM inserted;
  INSERT INTO public.credit_transactions(company_id, amount, type, note)
  VALUES (v_company_id, -v_cost, 'deduct', 'API SMS credit reservation (' || v_cost || ' credits)');
  UPDATE public.api_sms_requests SET campaign_id = v_campaign_id, updated_at = now() WHERE id = v_request_id;
  UPDATE public.customer_api_keys SET last_used_at = now() WHERE id = v_api_key_id;
  RETURN jsonb_build_object('created', true, 'request_id', v_request_id, 'campaign_id', v_campaign_id, 'sender_id', v_sender_id,
    'segments', v_segments, 'skipped_recipients', v_skipped, 'messages', v_messages);
END;
$$;

REVOKE ALL ON FUNCTION public.add_suppression_entry(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_suppression_entries(TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_suppression_entry(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_suppression_entry(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_suppression_entries(TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_suppression_entry(UUID) TO authenticated;
GRANT SELECT ON public.suppression_list TO authenticated;
