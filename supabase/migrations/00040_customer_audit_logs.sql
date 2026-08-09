-- Customer-visible company audit log feed.
-- Exposes only the active member's own company logs and keeps raw table access admin-only.

CREATE OR REPLACE FUNCTION public.list_company_audit_logs()
RETURNS TABLE (
  id UUID,
  actor_user_id UUID,
  actor_role TEXT,
  actor_name TEXT,
  action TEXT,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID := public.get_primary_company_id();
BEGIN
  IF v_company_id IS NULL OR NOT public.is_active_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Active accepted company membership required';
  END IF;

  IF NOT public.company_has_feature(v_company_id, 'audit_log') THEN
    RAISE EXCEPTION 'Audit log access requires Professional or Agency plan';
  END IF;

  RETURN QUERY
  SELECT
    log.id,
    log.actor_user_id,
    log.actor_role,
    COALESCE(profile.full_name, profile.email, log.actor_user_id::TEXT, 'API') AS actor_name,
    log.action,
    log.target_type,
    log.target_id,
    log.metadata,
    log.created_at
  FROM public.audit_logs log
  LEFT JOIN public.profiles profile ON profile.id = log.actor_user_id
  WHERE log.company_id = v_company_id
  ORDER BY log.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_audit_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_audit_logs() TO authenticated;
