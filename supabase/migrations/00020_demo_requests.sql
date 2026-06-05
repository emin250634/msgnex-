-- ============================================================
-- MSGNEX - Controlled beta demo requests
-- Public submissions go through the server API. Direct table access is
-- restricted to active admins so contact details are never publicly readable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  monthly_sms_volume TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_status_created
  ON public.demo_requests(status, created_at DESC);

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_requests_admin_all ON public.demo_requests;
CREATE POLICY demo_requests_admin_all ON public.demo_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_demo_request_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_demo_requests_updated_at ON public.demo_requests;
CREATE TRIGGER set_demo_requests_updated_at
  BEFORE UPDATE ON public.demo_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_demo_request_updated_at();

REVOKE ALL ON public.demo_requests FROM anon;
REVOKE ALL ON public.demo_requests FROM authenticated;
GRANT SELECT, UPDATE ON public.demo_requests TO authenticated;
