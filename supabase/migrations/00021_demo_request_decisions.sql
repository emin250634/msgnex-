-- ============================================================
-- MSGNEX - Demo request approval/rejection audit fields
-- ============================================================

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES public.company_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_demo_requests_company
  ON public.demo_requests(company_id);

CREATE INDEX IF NOT EXISTS idx_demo_requests_invitation
  ON public.demo_requests(invitation_id);
