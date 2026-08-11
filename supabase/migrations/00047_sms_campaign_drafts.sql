-- Campaign drafts store reusable in-progress SMS work without queueing delivery.

CREATE TABLE IF NOT EXISTS public.sms_campaign_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  message           TEXT NOT NULL DEFAULT '',
  audience_type     TEXT NOT NULL DEFAULT 'none',
  group_id          UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  manual_recipients TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_campaign_drafts_audience_type_check
    CHECK (audience_type IN ('none', 'all', 'group', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_sms_campaign_drafts_company_updated
  ON public.sms_campaign_drafts(company_id, updated_at DESC);

ALTER TABLE public.sms_campaign_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_campaign_drafts_admin_all ON public.sms_campaign_drafts;
CREATE POLICY sms_campaign_drafts_admin_all ON public.sms_campaign_drafts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sms_campaign_drafts_company_manage ON public.sms_campaign_drafts;
CREATE POLICY sms_campaign_drafts_company_manage ON public.sms_campaign_drafts
  FOR ALL TO authenticated
  USING (public.is_active_company_member(company_id))
  WITH CHECK (public.is_active_company_member(company_id));

COMMENT ON TABLE public.sms_campaign_drafts IS
  'In-progress SMS campaign drafts saved before queueing delivery.';
