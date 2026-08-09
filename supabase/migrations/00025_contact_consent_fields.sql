-- Contact-level permission state for commercial electronic communication workflows.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consent_source TEXT,
  ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_note TEXT;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_consent_status_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_consent_status_check
  CHECK (consent_status IN ('unknown', 'opted_in', 'opted_out'));

CREATE INDEX IF NOT EXISTS idx_contacts_company_consent
  ON public.contacts(company_id, consent_status);
