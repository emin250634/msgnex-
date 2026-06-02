-- Secure transactional SMS dispatch foundation.
-- The API reserves credits and creates pending messages atomically, then
-- completes the dispatch after the provider responds.

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.sms_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_error TEXT;

CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign
  ON public.sms_messages(campaign_id);

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('add', 'deduct', 'purchase', 'refund'));

-- Customers must not be able to change role, company_id, or is_active.
DROP POLICY IF EXISTS profiles_customer_update ON public.profiles;
CREATE POLICY profiles_customer_update ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- Retire the unsafe RPC if it existed in an earlier prototype deployment.
DO $$
BEGIN
  IF to_regprocedure('public.deduct_sms_credits(uuid,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.deduct_sms_credits(uuid, integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.deduct_sms_credits(uuid, integer) FROM authenticated;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_customer_onboarding(p_company_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_company_name)) < 2 OR length(trim(p_company_name)) > 120 THEN
    RAISE EXCEPTION 'Invalid company name';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = v_user_id AND role = 'customer';

  IF v_company_id IS NOT NULL THEN
    RETURN v_company_id;
  END IF;

  INSERT INTO public.companies (name, sender_name, sender_approved)
  VALUES (trim(p_company_name), left(trim(p_company_name), 11), false)
  RETURNING id INTO v_company_id;

  UPDATE public.profiles
  SET company_id = v_company_id, updated_at = now()
  WHERE id = v_user_id AND role = 'customer' AND company_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.sms_credits (company_id, balance)
  VALUES (v_company_id, 0);

  RETURN v_company_id;
END;
$$;

-- Create the customer company during signup as well. This keeps onboarding
-- working when Supabase email confirmation is enabled and no session exists yet.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_name TEXT := trim(COALESCE(NEW.raw_user_meta_data->>'company_name', ''));
  v_company_id UUID;
BEGIN
  IF length(v_company_name) >= 2 AND length(v_company_name) <= 120 THEN
    INSERT INTO public.companies (name, sender_name, sender_approved)
    VALUES (v_company_name, left(v_company_name, 11), false)
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'customer',
    v_company_id
  );

  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.sms_credits (company_id, balance)
    VALUES (v_company_id, 0);
  END IF;

  RETURN NEW;
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
  v_cost INTEGER;
  v_messages JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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

  SELECT p.company_id, c.sender_name
  INTO v_company_id, v_sender_id
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = v_user_id
    AND p.role = 'customer'
    AND p.is_active = true
    AND c.is_active = true
    AND c.sender_approved = true
    AND length(trim(c.sender_name)) > 0;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Active company and approved sender ID required';
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
    'Transactional SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
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
    company_id, amount, type, note, created_by
  )
  VALUES (
    v_company_id, -v_cost, 'deduct',
    'SMS credit reservation (' || v_cost || ' messages)', v_user_id
  );

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'sender_id', v_sender_id,
    'reserved_credits', v_cost,
    'messages', v_messages
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_sms_dispatch(
  p_campaign_id UUID,
  p_results JSONB
)
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
  v_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT campaign.company_id, campaign.total_recipients
  INTO v_company_id, v_total
  FROM public.sms_campaigns campaign
  JOIN public.profiles profile ON profile.company_id = campaign.company_id
  WHERE campaign.id = p_campaign_id
    AND campaign.status = 'sending'
    AND profile.id = v_user_id
    AND profile.role = 'customer';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Dispatch not found';
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
    AND message.campaign_id = p_campaign_id
    AND message.status = 'pending';

  SELECT
    count(*) FILTER (WHERE status = 'sent'),
    count(*) FILTER (WHERE status = 'failed')
  INTO v_success, v_failed
  FROM public.sms_messages
  WHERE company_id = v_company_id
    AND campaign_id = p_campaign_id;

  IF v_success + v_failed <> v_total THEN
    RAISE EXCEPTION 'Incomplete provider result set';
  END IF;

  IF v_failed > 0 THEN
    UPDATE public.sms_credits
    SET balance = balance + v_failed, updated_at = now()
    WHERE company_id = v_company_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_transactions (
      company_id, amount, type, note, created_by
    )
    VALUES (
      v_company_id, v_failed, 'refund',
      'Failed SMS refund (' || v_failed || ' messages)', v_user_id
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
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'success', v_success,
    'fail', v_failed,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_customer_onboarding(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sms_dispatch(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_sms_dispatch(UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.complete_customer_onboarding(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sms_dispatch(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sms_dispatch(UUID, JSONB) TO authenticated;
