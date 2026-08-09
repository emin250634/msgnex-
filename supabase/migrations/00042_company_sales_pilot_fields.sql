-- Admin-managed sales and pilot tracking fields for companies.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sales_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS pilot_started_at DATE,
  ADD COLUMN IF NOT EXISTS expected_monthly_sms_volume TEXT,
  ADD COLUMN IF NOT EXISTS sales_note TEXT;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_sales_status_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_sales_status_check
  CHECK (sales_status IN ('new', 'contacted', 'pilot', 'won', 'lost'));

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_sales_note_length_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_sales_note_length_check
  CHECK (sales_note IS NULL OR length(sales_note) <= 2000);

CREATE INDEX IF NOT EXISTS idx_companies_sales_status
  ON public.companies(sales_status, created_at DESC);
