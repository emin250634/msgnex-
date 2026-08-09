-- Contact consent change history for permission evidence and operational review.

CREATE TABLE IF NOT EXISTS public.contact_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  source TEXT,
  note TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_consent_events_previous_status_check
    CHECK (previous_status IS NULL OR previous_status IN ('unknown', 'opted_in', 'opted_out')),
  CONSTRAINT contact_consent_events_next_status_check
    CHECK (next_status IN ('unknown', 'opted_in', 'opted_out'))
);

CREATE INDEX IF NOT EXISTS idx_contact_consent_events_contact
  ON public.contact_consent_events(contact_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_consent_events_company
  ON public.contact_consent_events(company_id, recorded_at DESC);

ALTER TABLE public.contact_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_consent_events_admin_all
  ON public.contact_consent_events;
CREATE POLICY contact_consent_events_admin_all
  ON public.contact_consent_events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS contact_consent_events_company_select
  ON public.contact_consent_events;
CREATE POLICY contact_consent_events_company_select
  ON public.contact_consent_events
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS contact_consent_events_company_insert
  ON public.contact_consent_events;
CREATE POLICY contact_consent_events_company_insert
  ON public.contact_consent_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_company_member(company_id));
