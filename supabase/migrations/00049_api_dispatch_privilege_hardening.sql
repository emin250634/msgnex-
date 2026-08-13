-- Ensure API dispatch SECURITY DEFINER functions are service-role only.
-- This preserves the production privilege hotfix for future clean installs.

REVOKE EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.flag_stale_api_sms_dispatches(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.flag_stale_api_sms_dispatches(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.flag_stale_api_sms_dispatches(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.flag_stale_api_sms_dispatches(INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) TO service_role;
