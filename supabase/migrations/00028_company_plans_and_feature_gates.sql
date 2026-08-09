-- Adds software package assignment to companies and gates API access by plan.
-- Plans cover MSGNEX platform features only; SMS credit remains on the provider side.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_plan_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_plan_check
  CHECK (plan IN ('starter', 'professional', 'agency'));

CREATE INDEX IF NOT EXISTS idx_companies_plan
  ON public.companies(plan);

CREATE OR REPLACE FUNCTION public.company_has_feature(p_company_id UUID, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_feature = 'api_access' THEN company.plan IN ('professional', 'agency')
    WHEN p_feature = 'audit_log' THEN company.plan IN ('professional', 'agency')
    WHEN p_feature = 'webhook' THEN company.plan = 'agency'
    ELSE false
  END
  FROM public.companies company
  WHERE company.id = p_company_id
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active');
$$;

CREATE OR REPLACE FUNCTION public.get_customer_plan()
RETURNS TABLE (
  company_id UUID,
  plan TEXT,
  has_api_access BOOLEAN,
  has_audit_log BOOLEAN,
  has_webhook BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID := public.get_primary_company_id();
BEGIN
  IF v_company_id IS NULL OR NOT public.is_active_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Active accepted company membership required';
  END IF;

  RETURN QUERY
  SELECT
    company.id,
    company.plan,
    public.company_has_feature(company.id, 'api_access'),
    public.company_has_feature(company.id, 'audit_log'),
    public.company_has_feature(company.id, 'webhook')
  FROM public.companies company
  WHERE company.id = v_company_id;
END;
$$;

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
  RETURN v_key_id;
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
    AND company.plan IN ('professional', 'agency')
    AND setting.provider_name = 'netgsm'
    AND setting.is_active = true
    AND setting.usercode IS NOT NULL
    AND setting.encrypted_secret IS NOT NULL
    AND length(trim(setting.sender_header)) > 0;

  IF v_api_key_id IS NULL THEN RAISE EXCEPTION 'Invalid API key, inactive provider connection, or API feature not enabled for plan'; END IF;

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

REVOKE ALL ON FUNCTION public.company_has_feature(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_feature(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_plan() TO authenticated;
