-- Include customer-safe delivery payload in webhook observability output.

DROP FUNCTION IF EXISTS public.list_company_webhook_deliveries(INTEGER);

CREATE OR REPLACE FUNCTION public.list_company_webhook_deliveries(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  webhook_id UUID,
  endpoint_url TEXT,
  event_type TEXT,
  payload JSONB,
  status TEXT,
  attempts INTEGER,
  max_attempts INTEGER,
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  response_status INTEGER,
  response_body TEXT,
  error TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
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
    delivery.id,
    delivery.webhook_id,
    webhook.endpoint_url,
    delivery.event_type,
    delivery.payload,
    delivery.status,
    delivery.attempts,
    delivery.max_attempts,
    delivery.next_attempt_at,
    delivery.delivered_at,
    delivery.response_status,
    delivery.response_body,
    delivery.error,
    delivery.created_at,
    delivery.updated_at
  FROM public.webhook_deliveries delivery
  JOIN public.company_webhooks webhook ON webhook.id = delivery.webhook_id
  WHERE delivery.company_id = v_company_id
  ORDER BY delivery.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_webhook_deliveries(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_webhook_deliveries(INTEGER) TO authenticated;
