-- Customer API keys and idempotent external transactional SMS dispatch.

CREATE TABLE IF NOT EXISTS public.customer_api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.api_sms_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id      UUID NOT NULL REFERENCES public.customer_api_keys(id) ON DELETE RESTRICT,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES public.sms_campaigns(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
  response        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(api_key_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_api_keys_company
  ON public.customer_api_keys(company_id);

CREATE INDEX IF NOT EXISTS idx_api_sms_requests_company
  ON public.api_sms_requests(company_id);

ALTER TABLE public.customer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_sms_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_api_keys_admin_all ON public.customer_api_keys;
CREATE POLICY customer_api_keys_admin_all ON public.customer_api_keys
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS customer_api_keys_customer_view ON public.customer_api_keys;

DROP POLICY IF EXISTS api_sms_requests_admin_all ON public.api_sms_requests;
CREATE POLICY api_sms_requests_admin_all ON public.api_sms_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS api_sms_requests_customer_view ON public.api_sms_requests;
CREATE POLICY api_sms_requests_customer_view ON public.api_sms_requests
  FOR SELECT USING (company_id = public.my_company_id());

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
  v_company_id UUID;
  v_key_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_name)) < 2 OR length(trim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Invalid API key name';
  END IF;

  IF p_key_prefix !~ '^mnx_[A-Za-z0-9_-]{6,20}$' OR p_key_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid API key format';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = v_user_id
    AND role = 'customer'
    AND is_active = true
    AND company_id IS NOT NULL;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Active customer company required';
  END IF;

  INSERT INTO public.customer_api_keys (
    company_id, name, key_prefix, key_hash, created_by
  )
  VALUES (
    v_company_id, trim(p_name), p_key_prefix, p_key_hash, v_user_id
  )
  RETURNING id INTO v_key_id;

  RETURN v_key_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_customer_api_key(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.customer_api_keys api_key
  SET is_active = false, revoked_at = now()
  WHERE api_key.id = p_key_id
    AND api_key.company_id = public.my_company_id()
    AND api_key.is_active = true;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_customer_api_keys()
RETURNS TABLE (
  id UUID,
  name TEXT,
  key_prefix TEXT,
  is_active BOOLEAN,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    api_key.id,
    api_key.name,
    api_key.key_prefix,
    api_key.is_active,
    api_key.last_used_at,
    api_key.created_at,
    api_key.revoked_at
  FROM public.customer_api_keys api_key
  WHERE api_key.company_id = public.my_company_id()
  ORDER BY api_key.created_at DESC;
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
  v_cost INTEGER;
  v_messages JSONB;
  v_existing_status TEXT;
  v_existing_response JSONB;
BEGIN
  IF p_api_key_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid API key';
  END IF;

  IF length(trim(p_idempotency_key)) < 8 OR length(trim(p_idempotency_key)) > 120 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 160 THEN
    RAISE EXCEPTION 'Message must contain 1 to 160 characters';
  END IF;

  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN
    RAISE EXCEPTION 'Recipient count must be between 1 and 1000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_recipients) AS recipient
    WHERE recipient !~ '^[0-9]{10,15}$'
  ) THEN
    RAISE EXCEPTION 'Invalid recipient phone number';
  END IF;

  SELECT api_key.id, api_key.company_id, company.sender_name
  INTO v_api_key_id, v_company_id, v_sender_id
  FROM public.customer_api_keys api_key
  JOIN public.companies company ON company.id = api_key.company_id
  WHERE api_key.key_hash = p_api_key_hash
    AND api_key.is_active = true
    AND company.is_active = true
    AND company.sender_approved = true
    AND length(trim(company.sender_name)) > 0;

  IF v_api_key_id IS NULL THEN
    RAISE EXCEPTION 'Invalid API key or inactive company';
  END IF;

  SELECT status, response
  INTO v_existing_status, v_existing_response
  FROM public.api_sms_requests
  WHERE api_key_id = v_api_key_id
    AND idempotency_key = trim(p_idempotency_key);

  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', false,
      'status', v_existing_status,
      'response', v_existing_response
    );
  END IF;

  INSERT INTO public.api_sms_requests (
    api_key_id, company_id, idempotency_key, status
  )
  VALUES (
    v_api_key_id, v_company_id, trim(p_idempotency_key), 'processing'
  )
  ON CONFLICT (api_key_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_request_id;

  IF v_request_id IS NULL THEN
    SELECT status, response
    INTO v_existing_status, v_existing_response
    FROM public.api_sms_requests
    WHERE api_key_id = v_api_key_id
      AND idempotency_key = trim(p_idempotency_key);

    RETURN jsonb_build_object(
      'created', false,
      'status', v_existing_status,
      'response', v_existing_response
    );
  END IF;

  v_cost := cardinality(p_recipients);

  UPDATE public.sms_credits
  SET balance = balance - v_cost, updated_at = now()
  WHERE company_id = v_company_id AND balance >= v_cost;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  INSERT INTO public.sms_campaigns (
    company_id, name, message, total_recipients, status
  )
  VALUES (
    v_company_id,
    'API SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    p_message,
    v_cost,
    'sending'
  )
  RETURNING id INTO v_campaign_id;

  WITH inserted AS (
    INSERT INTO public.sms_messages (
      company_id, campaign_id, sender_id, recipient, message, status, credits_cost
    )
    SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', 1
    FROM unnest(p_recipients) AS recipient
    RETURNING id, recipient
  )
  SELECT jsonb_agg(jsonb_build_object('id', id, 'recipient', recipient))
  INTO v_messages
  FROM inserted;

  INSERT INTO public.credit_transactions (
    company_id, amount, type, note
  )
  VALUES (
    v_company_id, -v_cost, 'deduct',
    'API SMS credit reservation (' || v_cost || ' messages)'
  );

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
    'sender_id', v_sender_id,
    'messages', v_messages
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
  v_balance INTEGER;
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

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'API dispatch not found';
  END IF;

  WITH results AS (
    SELECT *
    FROM jsonb_to_recordset(p_results) AS result(
      id UUID,
      success BOOLEAN,
      provider_message_id TEXT,
      error TEXT
    )
  )
  UPDATE public.sms_messages message
  SET status = CASE WHEN result.success THEN 'sent' ELSE 'failed' END,
      provider_message_id = result.provider_message_id,
      provider_error = result.error,
      sent_at = CASE WHEN result.success THEN now() ELSE NULL END
  FROM results result
  WHERE message.id = result.id
    AND message.company_id = v_company_id
    AND message.campaign_id = v_campaign_id
    AND message.status = 'pending';

  SELECT
    count(*) FILTER (WHERE status = 'sent'),
    count(*) FILTER (WHERE status = 'failed')
  INTO v_success, v_failed
  FROM public.sms_messages
  WHERE company_id = v_company_id
    AND campaign_id = v_campaign_id;

  IF v_success + v_failed <> v_total THEN
    RAISE EXCEPTION 'Incomplete provider result set';
  END IF;

  IF v_failed > 0 THEN
    UPDATE public.sms_credits
    SET balance = balance + v_failed, updated_at = now()
    WHERE company_id = v_company_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_transactions (
      company_id, amount, type, note
    )
    VALUES (
      v_company_id, v_failed, 'refund',
      'Failed API SMS refund (' || v_failed || ' messages)'
    );
  ELSE
    SELECT balance INTO v_balance
    FROM public.sms_credits
    WHERE company_id = v_company_id;
  END IF;

  UPDATE public.sms_campaigns
  SET success_count = v_success,
      fail_count = v_failed,
      status = CASE WHEN v_success > 0 THEN 'completed' ELSE 'failed' END,
      sent_at = now(),
      updated_at = now()
  WHERE id = v_campaign_id;

  v_response := jsonb_build_object(
    'campaignId', v_campaign_id,
    'success', v_success,
    'fail', v_failed,
    'balance', v_balance
  );

  UPDATE public.api_sms_requests
  SET status = 'completed', response = v_response, updated_at = now()
  WHERE id = p_request_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_api_key(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_customer_api_key(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_customer_api_keys() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_customer_api_key(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_customer_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_api_keys() TO authenticated;

-- External API dispatch intentionally accepts anonymous database calls.
-- Authentication happens inside the functions with the stored API key hash.
REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) TO authenticated;
