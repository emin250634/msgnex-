-- Tracks software package upgrade requests from company users.
-- This is not an SMS credit purchase flow; MSGNEX packages cover platform usage.

CREATE TABLE IF NOT EXISTS public.plan_upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_plan TEXT NOT NULL,
  current_plan TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_upgrade_requests_requested_plan_check
    CHECK (requested_plan IN ('starter', 'professional', 'agency')),
  CONSTRAINT plan_upgrade_requests_current_plan_check
    CHECK (current_plan IS NULL OR current_plan IN ('starter', 'professional', 'agency')),
  CONSTRAINT plan_upgrade_requests_status_check
    CHECK (status IN ('new', 'contacted', 'closed')),
  CONSTRAINT plan_upgrade_requests_message_length_check
    CHECK (message IS NULL OR length(message) <= 1000),
  CONSTRAINT plan_upgrade_requests_admin_note_length_check
    CHECK (admin_note IS NULL OR length(admin_note) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_plan_upgrade_requests_company_created
  ON public.plan_upgrade_requests(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_upgrade_requests_status_created
  ON public.plan_upgrade_requests(status, created_at DESC);

ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_upgrade_requests_admin_all
  ON public.plan_upgrade_requests;
CREATE POLICY plan_upgrade_requests_admin_all
  ON public.plan_upgrade_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS plan_upgrade_requests_company_select
  ON public.plan_upgrade_requests;
CREATE POLICY plan_upgrade_requests_company_select
  ON public.plan_upgrade_requests
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS plan_upgrade_requests_company_insert
  ON public.plan_upgrade_requests;
CREATE POLICY plan_upgrade_requests_company_insert
  ON public.plan_upgrade_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_company_member(company_id)
    AND requested_by = auth.uid()
  );

DROP TRIGGER IF EXISTS set_plan_upgrade_requests_updated_at
  ON public.plan_upgrade_requests;
CREATE TRIGGER set_plan_upgrade_requests_updated_at
  BEFORE UPDATE ON public.plan_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_company_provider_updated_at();

REVOKE ALL ON public.plan_upgrade_requests FROM anon;
REVOKE ALL ON public.plan_upgrade_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.plan_upgrade_requests TO authenticated;
