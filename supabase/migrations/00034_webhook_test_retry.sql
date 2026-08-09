-- Customer actions for webhook test deliveries and manual retry.

ALTER TABLE public.webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_event_type_check;

ALTER TABLE public.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_event_type_check
  CHECK (event_type IN ('campaign.completed', 'sms.failed', 'provider.status_updated', 'webhook.test'));

CREATE OR REPLACE FUNCTION public.create_company_webhook_test_delivery(p_webhook_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID := public.get_primary_company_id();
  v_delivery_id UUID;
BEGIN
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF NOT public.company_has_feature(v_company_id, 'webhook') THEN
    RAISE EXCEPTION 'Webhook access requires Agency plan';
  END IF;

  INSERT INTO public.webhook_deliveries(webhook_id, company_id, event_type, payload)
  SELECT
    webhook.id,
    webhook.company_id,
    'webhook.test',
    jsonb_build_object(
      'event', 'webhook.test',
      'webhookId', webhook.id,
      'companyId', webhook.company_id,
      'endpointUrl', webhook.endpoint_url,
      'message', 'MSGNEX webhook test delivery',
      'occurredAt', now()
    )
  FROM public.company_webhooks webhook
  WHERE webhook.id = p_webhook_id
    AND webhook.company_id = v_company_id
    AND webhook.is_active = true
  RETURNING id INTO v_delivery_id;

  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION 'Active webhook not found';
  END IF;

  RETURN v_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_company_webhook_delivery(p_delivery_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID := public.get_primary_company_id();
BEGIN
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF NOT public.company_has_feature(v_company_id, 'webhook') THEN
    RAISE EXCEPTION 'Webhook access requires Agency plan';
  END IF;

  UPDATE public.webhook_deliveries delivery
  SET status = 'queued',
      next_attempt_at = now(),
      locked_at = NULL,
      error = NULL,
      updated_at = now()
  WHERE delivery.id = p_delivery_id
    AND delivery.company_id = v_company_id
    AND delivery.status IN ('failed', 'success')
    AND delivery.attempts < delivery.max_attempts;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_webhook_test_delivery(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_company_webhook_delivery(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_company_webhook_test_delivery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_company_webhook_delivery(UUID) TO authenticated;
