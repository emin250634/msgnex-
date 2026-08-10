-- ============================================================
-- MSGNEX - Demo request provider intake fields
-- Collects sales discovery details without changing provider setup flow.
-- ============================================================

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS has_sms_provider TEXT
    CHECK (has_sms_provider IS NULL OR has_sms_provider IN ('yes', 'no', 'planning')),
  ADD COLUMN IF NOT EXISTS sms_provider_name TEXT;

COMMENT ON COLUMN public.demo_requests.has_sms_provider IS
  'Whether the prospect already has an SMS provider account: yes, no, or planning.';

COMMENT ON COLUMN public.demo_requests.sms_provider_name IS
  'Free-text provider name shared during demo intake. This is sales discovery data, not an active integration setting.';
