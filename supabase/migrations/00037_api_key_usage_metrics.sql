-- Customer-safe API key usage metrics for visibility and rate limit preparation.

CREATE OR REPLACE FUNCTION public.list_customer_api_key_usage()
RETURNS TABLE (
  key_id UUID,
  total_requests INTEGER,
  requests_last_24h INTEGER,
  completed_requests INTEGER,
  processing_requests INTEGER,
  successful_messages INTEGER,
  failed_messages INTEGER,
  last_request_at TIMESTAMPTZ
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

  RETURN QUERY
  SELECT
    api_key.id,
    count(request.id)::INTEGER AS total_requests,
    count(request.id) FILTER (WHERE request.created_at >= now() - interval '24 hours')::INTEGER AS requests_last_24h,
    count(request.id) FILTER (WHERE request.status = 'completed')::INTEGER AS completed_requests,
    count(request.id) FILTER (WHERE request.status = 'processing')::INTEGER AS processing_requests,
    COALESCE(sum(COALESCE((request.response->>'success')::INTEGER, 0)), 0)::INTEGER AS successful_messages,
    COALESCE(sum(COALESCE((request.response->>'fail')::INTEGER, 0)), 0)::INTEGER AS failed_messages,
    max(request.created_at) AS last_request_at
  FROM public.customer_api_keys api_key
  LEFT JOIN public.api_sms_requests request
    ON request.api_key_id = api_key.id
    AND request.company_id = v_company_id
  WHERE api_key.company_id = v_company_id
  GROUP BY api_key.id
  ORDER BY max(request.created_at) DESC NULLS LAST, api_key.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_customer_api_key_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_customer_api_key_usage() TO authenticated;
