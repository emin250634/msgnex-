-- ============================================================
-- MSGNEX - Company users and invitation foundation
-- Firma kullanicilari, yeni roller ve firma durum modeli.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_provider_setup';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('pending_review', 'pending_provider_setup', 'active', 'suspended', 'rejected'));

UPDATE public.companies
SET status = CASE
  WHEN is_active IS TRUE THEN 'active'
  ELSE 'suspended'
END
WHERE status IS NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%'
    AND pg_get_constraintdef(oid) LIKE '%admin%'
    AND pg_get_constraintdef(oid) LIKE '%customer%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'company_owner', 'company_admin', 'company_user', 'customer'));

CREATE TABLE IF NOT EXISTS public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('company_owner', 'company_admin', 'company_user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('company_owner', 'company_admin', 'company_user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'failed')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_company_users_company
  ON public.company_users(company_id);

CREATE INDEX IF NOT EXISTS idx_company_users_user
  ON public.company_users(user_id);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company
  ON public.company_invitations(company_id, invited_at DESC);

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users membership
    WHERE membership.user_id = auth.uid()
      AND membership.company_id = p_company_id
      AND membership.is_active = true
  );
$$;

DROP POLICY IF EXISTS company_users_admin_all ON public.company_users;
CREATE POLICY company_users_admin_all
  ON public.company_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS company_users_company_select ON public.company_users;
CREATE POLICY company_users_company_select
  ON public.company_users
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS company_invitations_admin_all ON public.company_invitations;
CREATE POLICY company_invitations_admin_all
  ON public.company_invitations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_company_user_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_users_updated_at ON public.company_users;
CREATE TRIGGER set_company_users_updated_at
  BEFORE UPDATE ON public.company_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_user_updated_at();

DROP TRIGGER IF EXISTS set_company_invitations_updated_at ON public.company_invitations;
CREATE TRIGGER set_company_invitations_updated_at
  BEFORE UPDATE ON public.company_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_user_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'company_user'),
    NULLIF(NEW.raw_user_meta_data->>'company_id', '')::UUID
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, public.profiles.email),
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      role = COALESCE(EXCLUDED.role, public.profiles.role),
      company_id = COALESCE(EXCLUDED.company_id, public.profiles.company_id),
      updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
