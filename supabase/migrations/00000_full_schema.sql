-- ============================================================
-- MSGNEX - Full Schema (run this once in Supabase SQL Editor)
-- ============================================================

-- 1. COMPANIES
CREATE TABLE IF NOT EXISTS public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  tax_no      TEXT,
  phone       TEXT,
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PROFILES (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'customer')) DEFAULT 'customer',
  company_id  UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. SMS CREDITS
CREATE TABLE IF NOT EXISTS public.sms_credits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- 4. CREDIT TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('add', 'deduct', 'purchase')),
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. GROUPS
CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. CONTACTS
CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT,
  phone       TEXT NOT NULL,
  email       TEXT,
  group_id    UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. SMS MESSAGES
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id     TEXT NOT NULL DEFAULT 'Msgnex',
  recipient     TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  credits_cost  INTEGER NOT NULL DEFAULT 1,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. SMS CAMPAIGNS
CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  message         TEXT NOT NULL,
  group_id        UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  success_count    INTEGER NOT NULL DEFAULT 0,
  fail_count       INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. SMS TEMPLATES
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_group ON public.contacts(group_id);
CREATE INDEX IF NOT EXISTS idx_groups_company ON public.groups(company_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_company ON public.sms_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON public.sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_company ON public.sms_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_company ON public.credit_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_company ON public.sms_templates(company_id);

-- Enable Row Level Security
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- Security definer helpers (bypass RLS, no recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Drop old policies (safe to run even if they don't exist)
DROP POLICY IF EXISTS companies_admin_all ON public.companies;
DROP POLICY IF EXISTS companies_customer_view ON public.companies;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_customer_view ON public.profiles;
DROP POLICY IF EXISTS credits_admin_all ON public.sms_credits;
DROP POLICY IF EXISTS credits_customer_view ON public.sms_credits;
DROP POLICY IF EXISTS tx_admin_all ON public.credit_transactions;
DROP POLICY IF EXISTS tx_customer_view ON public.credit_transactions;
DROP POLICY IF EXISTS contacts_admin_all ON public.contacts;
DROP POLICY IF EXISTS contacts_customer_manage ON public.contacts;
DROP POLICY IF EXISTS groups_admin_all ON public.groups;
DROP POLICY IF EXISTS groups_customer_manage ON public.groups;
DROP POLICY IF EXISTS sms_admin_all ON public.sms_messages;
DROP POLICY IF EXISTS sms_customer_view ON public.sms_messages;
DROP POLICY IF EXISTS campaigns_admin_all ON public.sms_campaigns;
DROP POLICY IF EXISTS campaigns_customer_manage ON public.sms_campaigns;
DROP POLICY IF EXISTS templates_admin_all ON public.sms_templates;
DROP POLICY IF EXISTS templates_customer_manage ON public.sms_templates;

-- Profiles
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY profiles_self ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_customer_update ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_company_view ON public.profiles FOR SELECT USING (company_id = public.my_company_id());

-- Companies
CREATE POLICY companies_admin_all ON public.companies FOR ALL USING (public.is_admin());
CREATE POLICY companies_customer_view ON public.companies FOR SELECT USING (id = public.my_company_id());

-- SMS Credits
CREATE POLICY credits_admin_all ON public.sms_credits FOR ALL USING (public.is_admin());
CREATE POLICY credits_customer_view ON public.sms_credits FOR SELECT USING (company_id = public.my_company_id());

-- Credit Transactions
CREATE POLICY tx_admin_all ON public.credit_transactions FOR ALL USING (public.is_admin());
CREATE POLICY tx_customer_view ON public.credit_transactions FOR SELECT USING (company_id = public.my_company_id());

-- Contacts
CREATE POLICY contacts_admin_all ON public.contacts FOR ALL USING (public.is_admin());
CREATE POLICY contacts_customer_manage ON public.contacts FOR ALL USING (company_id = public.my_company_id());

-- Groups
CREATE POLICY groups_admin_all ON public.groups FOR ALL USING (public.is_admin());
CREATE POLICY groups_customer_manage ON public.groups FOR ALL USING (company_id = public.my_company_id());

-- SMS Messages
CREATE POLICY sms_admin_all ON public.sms_messages FOR ALL USING (public.is_admin());
CREATE POLICY sms_customer_view ON public.sms_messages FOR SELECT USING (company_id = public.my_company_id());

-- SMS Campaigns
CREATE POLICY campaigns_admin_all ON public.sms_campaigns FOR ALL USING (public.is_admin());
CREATE POLICY campaigns_customer_manage ON public.sms_campaigns FOR ALL USING (company_id = public.my_company_id());

-- SMS Templates
CREATE POLICY templates_admin_all ON public.sms_templates FOR ALL USING (public.is_admin());
CREATE POLICY templates_customer_manage ON public.sms_templates FOR ALL USING (company_id = public.my_company_id());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
