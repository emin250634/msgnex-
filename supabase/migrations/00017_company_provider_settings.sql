-- ============================================================
-- MSGNEX - Company provider settings
-- Firma bazli Netgsm baglanti ayarlari ve provider bakiye gorunurlugu.
--
-- Not: encrypted_secret alani duz metin parola icermemelidir. Uygulama
-- katmani bu alana yalnizca sifrelenmis secret yazmalidir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  usercode TEXT,
  encrypted_secret TEXT,
  secret_last_changed_at TIMESTAMPTZ,
  sender_header TEXT,
  sender_header_status TEXT NOT NULL DEFAULT 'unknown',
  connection_status TEXT NOT NULL DEFAULT 'not_configured',
  last_connection_test_at TIMESTAMPTZ,
  last_error TEXT,
  api_endpoint TEXT,
  encoding TEXT DEFAULT 'TR',
  timeout_ms INTEGER DEFAULT 15000,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_provider_settings_provider_name_check
    CHECK (provider_name IN ('netgsm')),
  CONSTRAINT company_provider_settings_sender_header_status_check
    CHECK (sender_header_status IN ('unknown', 'pending', 'approved', 'rejected', 'error')),
  CONSTRAINT company_provider_settings_connection_status_check
    CHECK (connection_status IN ('not_configured', 'connected', 'error', 'disabled')),
  CONSTRAINT company_provider_settings_timeout_ms_check
    CHECK (timeout_ms IS NULL OR timeout_ms > 0),
  CONSTRAINT company_provider_settings_company_provider_unique
    UNIQUE (company_id, provider_name)
);

COMMENT ON TABLE public.company_provider_settings IS
  'Firma bazli SMS provider baglanti ayarlari. MVP provider: netgsm.';

COMMENT ON COLUMN public.company_provider_settings.encrypted_secret IS
  'Duz metin parola/API secret saklanmamalidir; yalnizca uygulama tarafinda sifrelenmis deger yazilmalidir.';

COMMENT ON CONSTRAINT company_provider_settings_provider_name_check
  ON public.company_provider_settings IS
  'MVP asamasinda yalnizca netgsm desteklenir. Yeni providerlar sonraki migration ile bu constraint genisletilerek eklenmelidir.';

CREATE TABLE IF NOT EXISTS public.company_provider_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_setting_id UUID REFERENCES public.company_provider_settings(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  balance_unit TEXT DEFAULT 'sms',
  currency TEXT DEFAULT 'TRY',
  raw_balance_response JSONB,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'unknown',
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_provider_wallets_provider_name_check
    CHECK (provider_name IN ('netgsm')),
  CONSTRAINT company_provider_wallets_balance_check
    CHECK (balance >= 0),
  CONSTRAINT company_provider_wallets_sync_status_check
    CHECK (sync_status IN ('unknown', 'synced', 'error', 'stale')),
  CONSTRAINT company_provider_wallets_company_provider_unique
    UNIQUE (company_id, provider_name)
);

COMMENT ON TABLE public.company_provider_wallets IS
  'Firma bazli provider bakiyesi. sms_credits ile karistirilmamalidir; bu tablo Netgsm gibi harici provider bakiyesini temsil eder.';

COMMENT ON CONSTRAINT company_provider_wallets_provider_name_check
  ON public.company_provider_wallets IS
  'MVP asamasinda yalnizca netgsm desteklenir. Yeni providerlar sonraki migration ile bu constraint genisletilerek eklenmelidir.';

CREATE INDEX IF NOT EXISTS idx_company_provider_settings_company
  ON public.company_provider_settings(company_id);

CREATE INDEX IF NOT EXISTS idx_company_provider_settings_provider
  ON public.company_provider_settings(provider_name);

CREATE INDEX IF NOT EXISTS idx_company_provider_settings_active
  ON public.company_provider_settings(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_company_provider_wallets_company
  ON public.company_provider_wallets(company_id);

CREATE INDEX IF NOT EXISTS idx_company_provider_wallets_provider
  ON public.company_provider_wallets(provider_name);

ALTER TABLE public.company_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_provider_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_provider_settings_admin_all
  ON public.company_provider_settings;
CREATE POLICY company_provider_settings_admin_all
  ON public.company_provider_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Customer read policy intentionally not added for company_provider_settings.
-- RLS cannot hide encrypted_secret at column level. Customer-facing provider
-- status should be exposed later through a safe view/RPC that excludes secrets.

DROP POLICY IF EXISTS company_provider_wallets_admin_all
  ON public.company_provider_wallets;
CREATE POLICY company_provider_wallets_admin_all
  ON public.company_provider_wallets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS company_provider_wallets_customer_select
  ON public.company_provider_wallets;
CREATE POLICY company_provider_wallets_customer_select
  ON public.company_provider_wallets
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());

CREATE OR REPLACE FUNCTION public.set_company_provider_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_provider_settings_updated_at
  ON public.company_provider_settings;
CREATE TRIGGER set_company_provider_settings_updated_at
  BEFORE UPDATE ON public.company_provider_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_provider_updated_at();

DROP TRIGGER IF EXISTS set_company_provider_wallets_updated_at
  ON public.company_provider_wallets;
CREATE TRIGGER set_company_provider_wallets_updated_at
  BEFORE UPDATE ON public.company_provider_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_provider_updated_at();
