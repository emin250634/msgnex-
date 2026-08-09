-- Stores sender headers returned by the company's own SMS provider account.
-- Sender headers must be selected from this table; they are not free-form input.

CREATE TABLE IF NOT EXISTS public.company_provider_sender_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL DEFAULT 'netgsm',
  header TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  raw_response JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_provider_sender_headers_provider_name_check
    CHECK (provider_name IN ('netgsm')),
  CONSTRAINT company_provider_sender_headers_status_check
    CHECK (status IN ('approved', 'pending', 'rejected', 'error')),
  CONSTRAINT company_provider_sender_headers_header_length_check
    CHECK (length(trim(header)) BETWEEN 1 AND 11),
  CONSTRAINT company_provider_sender_headers_unique
    UNIQUE (company_id, provider_name, header)
);

CREATE INDEX IF NOT EXISTS idx_company_provider_sender_headers_company
  ON public.company_provider_sender_headers(company_id);

ALTER TABLE public.company_provider_sender_headers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_provider_sender_headers_admin_all
  ON public.company_provider_sender_headers;
CREATE POLICY company_provider_sender_headers_admin_all
  ON public.company_provider_sender_headers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS company_provider_sender_headers_company_select
  ON public.company_provider_sender_headers;
CREATE POLICY company_provider_sender_headers_company_select
  ON public.company_provider_sender_headers
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP TRIGGER IF EXISTS set_company_provider_sender_headers_updated_at
  ON public.company_provider_sender_headers;
CREATE TRIGGER set_company_provider_sender_headers_updated_at
  BEFORE UPDATE ON public.company_provider_sender_headers
  FOR EACH ROW EXECUTE FUNCTION public.set_company_provider_updated_at();
