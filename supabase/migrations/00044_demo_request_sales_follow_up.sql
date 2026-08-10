-- ============================================================
-- MSGNEX - Demo request sales follow-up fields
-- Adds lightweight CRM notes for admin demo request tracking.
-- ============================================================

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS sales_note TEXT,
  ADD COLUMN IF NOT EXISTS recommended_provider TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

COMMENT ON COLUMN public.demo_requests.sales_note IS
  'Internal sales note for the demo request.';

COMMENT ON COLUMN public.demo_requests.recommended_provider IS
  'Provider recommendation discussed with the prospect.';

COMMENT ON COLUMN public.demo_requests.next_action IS
  'Next sales action to take for this demo request.';

COMMENT ON COLUMN public.demo_requests.follow_up_at IS
  'Optional follow-up datetime for the next sales action.';
