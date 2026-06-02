-- Keep sender IDs within the common alphanumeric SMS header length.
-- Provider-specific registration rules will be added with the real adapter.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sender_approved BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_sender_name_length_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_sender_name_length_check
  CHECK (length(sender_name) <= 11) NOT VALID;
