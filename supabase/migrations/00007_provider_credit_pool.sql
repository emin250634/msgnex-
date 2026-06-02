-- Provider credit inventory.
-- Admin records wholesale purchases and allocates credits to customer wallets.

CREATE TABLE IF NOT EXISTS public.provider_wallets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  currency      TEXT NOT NULL DEFAULT 'TRY',
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_credit_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_wallet_id UUID NOT NULL REFERENCES public.provider_wallets(id) ON DELETE RESTRICT,
  company_id         UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  amount             INTEGER NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('purchase', 'allocation', 'adjustment')),
  paid_amount        NUMERIC(12, 2),
  note               TEXT,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_credit_transactions_wallet
  ON public.provider_credit_transactions(provider_wallet_id);

ALTER TABLE public.provider_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_wallets_admin_all ON public.provider_wallets;
CREATE POLICY provider_wallets_admin_all ON public.provider_wallets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS provider_transactions_admin_all ON public.provider_credit_transactions;
CREATE POLICY provider_transactions_admin_all ON public.provider_credit_transactions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.purchase_provider_credits(
  p_provider_name TEXT,
  p_credits INTEGER,
  p_paid_amount NUMERIC,
  p_currency TEXT DEFAULT 'TRY',
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_wallet_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  IF length(trim(p_provider_name)) < 2 OR length(trim(p_provider_name)) > 80 THEN
    RAISE EXCEPTION 'Invalid provider name';
  END IF;

  IF p_credits <= 0 OR p_paid_amount <= 0 THEN
    RAISE EXCEPTION 'Credits and paid amount must be positive';
  END IF;

  IF p_currency IS NULL OR upper(trim(p_currency)) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter code';
  END IF;

  INSERT INTO public.provider_wallets (provider_name, currency, balance)
  VALUES (trim(p_provider_name), upper(trim(p_currency)), p_credits)
  ON CONFLICT (provider_name) DO UPDATE
  SET balance = public.provider_wallets.balance + EXCLUDED.balance,
      currency = EXCLUDED.currency,
      updated_at = now()
  RETURNING id INTO v_wallet_id;

  INSERT INTO public.provider_credit_transactions (
    provider_wallet_id, amount, type, paid_amount, note, created_by
  )
  VALUES (
    v_wallet_id, p_credits, 'purchase', p_paid_amount,
    NULLIF(trim(p_note), ''), v_admin_id
  );

  RETURN v_wallet_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_customer_credits(
  p_provider_wallet_id UUID,
  p_company_id UUID,
  p_credits INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_provider_balance INTEGER;
  v_customer_balance INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'Credits must be positive';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  UPDATE public.provider_wallets
  SET balance = balance - p_credits, updated_at = now()
  WHERE id = p_provider_wallet_id AND balance >= p_credits
  RETURNING balance INTO v_provider_balance;

  IF v_provider_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient provider credits';
  END IF;

  INSERT INTO public.sms_credits (company_id, balance)
  VALUES (p_company_id, p_credits)
  ON CONFLICT (company_id) DO UPDATE
  SET balance = public.sms_credits.balance + EXCLUDED.balance,
      updated_at = now()
  RETURNING balance INTO v_customer_balance;

  INSERT INTO public.provider_credit_transactions (
    provider_wallet_id, company_id, amount, type, note, created_by
  )
  VALUES (
    p_provider_wallet_id, p_company_id, -p_credits, 'allocation',
    NULLIF(trim(p_note), ''), v_admin_id
  );

  INSERT INTO public.credit_transactions (
    company_id, amount, type, note, created_by
  )
  VALUES (
    p_company_id, p_credits, 'add',
    COALESCE(NULLIF(trim(p_note), ''), 'Provider pool allocation'), v_admin_id
  );

  RETURN jsonb_build_object(
    'provider_balance', v_provider_balance,
    'customer_balance', v_customer_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_provider_credits(TEXT, INTEGER, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_customer_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.purchase_provider_credits(TEXT, INTEGER, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_customer_credits(UUID, UUID, INTEGER, TEXT) TO authenticated;
