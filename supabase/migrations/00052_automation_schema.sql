-- Birthday automation schema. This migration creates storage only; workers and
-- UI flows are intentionally added in later phases.

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'birthday',
  status TEXT NOT NULL DEFAULT 'inactive',
  target_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.sms_templates(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  send_time TIME NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  day_offset INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  last_run_on DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT automation_rules_type_check
    CHECK (type IN ('birthday')),
  CONSTRAINT automation_rules_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT automation_rules_name_check
    CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT automation_rules_message_check
    CHECK (length(trim(message)) BETWEEN 1 AND 612),
  CONSTRAINT automation_rules_day_offset_check
    CHECK (day_offset IN (0, 1, 7)),
  CONSTRAINT automation_rules_timezone_check
    CHECK (length(trim(timezone)) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  matched_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  queued_campaign_id UUID REFERENCES public.sms_campaigns(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT automation_runs_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'review_required')),
  CONSTRAINT automation_runs_rule_date_unique
    UNIQUE (automation_rule_id, run_date)
);

CREATE TABLE IF NOT EXISTS public.automation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  automation_run_id UUID NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  skip_reason TEXT,
  campaign_id UUID REFERENCES public.sms_campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT automation_candidates_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'queued', 'skipped')),
  CONSTRAINT automation_candidates_phone_check
    CHECK (phone ~ '^[0-9]{10,15}$'),
  CONSTRAINT automation_candidates_message_check
    CHECK (length(trim(message)) BETWEEN 1 AND 612),
  CONSTRAINT automation_candidates_rule_contact_date_unique
    UNIQUE (automation_rule_id, contact_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_company_status
  ON public.automation_rules(company_id, status, type);

CREATE INDEX IF NOT EXISTS idx_automation_rules_due
  ON public.automation_rules(status, send_time, last_run_on)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_automation_runs_company_started
  ON public.automation_runs(company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_candidates_company_status
  ON public.automation_candidates(company_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_automation_candidates_run
  ON public.automation_candidates(automation_run_id, status);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_rules_admin_all ON public.automation_rules;
CREATE POLICY automation_rules_admin_all ON public.automation_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS automation_rules_company_select ON public.automation_rules;
CREATE POLICY automation_rules_company_select ON public.automation_rules
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS automation_rules_company_manage ON public.automation_rules;
CREATE POLICY automation_rules_company_manage ON public.automation_rules
  FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(company_id))
  WITH CHECK (public.is_company_admin_or_owner(company_id));

DROP POLICY IF EXISTS automation_runs_admin_all ON public.automation_runs;
CREATE POLICY automation_runs_admin_all ON public.automation_runs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS automation_runs_company_select ON public.automation_runs;
CREATE POLICY automation_runs_company_select ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS automation_candidates_admin_all ON public.automation_candidates;
CREATE POLICY automation_candidates_admin_all ON public.automation_candidates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS automation_candidates_company_select ON public.automation_candidates;
CREATE POLICY automation_candidates_company_select ON public.automation_candidates
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS automation_candidates_company_manage ON public.automation_candidates;
CREATE POLICY automation_candidates_company_manage ON public.automation_candidates
  FOR UPDATE TO authenticated
  USING (public.is_company_admin_or_owner(company_id))
  WITH CHECK (public.is_company_admin_or_owner(company_id));

CREATE OR REPLACE FUNCTION public.set_automation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_automation_updated_at();

DROP TRIGGER IF EXISTS set_automation_candidates_updated_at ON public.automation_candidates;
CREATE TRIGGER set_automation_candidates_updated_at
  BEFORE UPDATE ON public.automation_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_automation_updated_at();

REVOKE ALL ON public.automation_rules FROM anon;
REVOKE ALL ON public.automation_rules FROM authenticated;
REVOKE ALL ON public.automation_runs FROM anon;
REVOKE ALL ON public.automation_runs FROM authenticated;
REVOKE ALL ON public.automation_candidates FROM anon;
REVOKE ALL ON public.automation_candidates FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules TO authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;
GRANT SELECT, UPDATE ON public.automation_candidates TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;
GRANT ALL ON public.automation_runs TO service_role;
GRANT ALL ON public.automation_candidates TO service_role;

REVOKE ALL ON FUNCTION public.set_automation_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_automation_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_automation_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_automation_updated_at() TO service_role;

COMMENT ON TABLE public.automation_rules IS
  'Company-owned automation rules. First supported type is birthday.';

COMMENT ON TABLE public.automation_runs IS
  'Execution history for automation rules. Worker RPCs are added in later phases.';

COMMENT ON TABLE public.automation_candidates IS
  'Manual approval queue for automation-generated SMS candidates.';
