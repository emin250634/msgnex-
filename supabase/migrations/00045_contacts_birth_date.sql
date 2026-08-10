-- Optional contact birth date for future birthday and special-day campaign workflows.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE INDEX IF NOT EXISTS idx_contacts_company_birth_date
  ON public.contacts(company_id, birth_date)
  WHERE birth_date IS NOT NULL;

COMMENT ON COLUMN public.contacts.birth_date IS
  'Optional contact birth date used for birthday and special-day campaign workflows.';
