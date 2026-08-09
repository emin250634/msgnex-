-- Webhook delivery queue and worker RPCs.

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.company_webhooks(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  response_status INTEGER,
  response_body TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_event_type_check
    CHECK (event_type IN ('campaign.completed', 'sms.failed', 'provider.status_updated')),
  CONSTRAINT webhook_deliveries_status_check
    CHECK (status IN ('queued', 'processing', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_claim
  ON public.webhook_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_created
  ON public.webhook_deliveries(webhook_id, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_deliveries_admin_all
  ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_all
  ON public.webhook_deliveries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_webhook_deliveries_updated_at
  ON public.webhook_deliveries;
CREATE TRIGGER set_webhook_deliveries_updated_at
  BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_company_webhooks_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_company_webhook_event(
  p_company_id UUID,
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  IF p_event_type NOT IN ('campaign.completed', 'sms.failed', 'provider.status_updated') THEN
    RAISE EXCEPTION 'Invalid webhook event type';
  END IF;

  INSERT INTO public.webhook_deliveries(webhook_id, company_id, event_type, payload)
  SELECT webhook.id, webhook.company_id, p_event_type, p_payload
  FROM public.company_webhooks webhook
  JOIN public.companies company ON company.id = webhook.company_id
  WHERE webhook.company_id = p_company_id
    AND webhook.is_active = true
    AND p_event_type = ANY(webhook.events)
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active')
    AND public.company_has_feature(company.id, 'webhook');

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_completed_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_company_webhook_event(
      NEW.company_id,
      'campaign.completed',
      jsonb_build_object(
        'event', 'campaign.completed',
        'campaignId', NEW.id,
        'companyId', NEW.company_id,
        'status', NEW.status,
        'totalRecipients', NEW.total_recipients,
        'skippedRecipients', NEW.skipped_recipients,
        'successCount', NEW.success_count,
        'failCount', NEW.fail_count,
        'providerName', NEW.provider_name,
        'providerBulkId', NEW.provider_bulk_id,
        'providerStatus', NEW.provider_status,
        'occurredAt', now()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_campaign_completed_webhook
  ON public.sms_campaigns;
CREATE TRIGGER enqueue_campaign_completed_webhook
  AFTER UPDATE ON public.sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_campaign_completed_webhook();

CREATE OR REPLACE FUNCTION public.enqueue_sms_failed_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'failed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_company_webhook_event(
      NEW.company_id,
      'sms.failed',
      jsonb_build_object(
        'event', 'sms.failed',
        'messageId', NEW.id,
        'campaignId', NEW.campaign_id,
        'companyId', NEW.company_id,
        'recipient', NEW.recipient,
        'providerName', NEW.provider_name,
        'providerMessageId', NEW.provider_message_id,
        'providerStatusCode', NEW.provider_status_code,
        'providerStatusText', NEW.provider_status_text,
        'error', NEW.provider_error,
        'occurredAt', COALESCE(NEW.failed_at, now())
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_sms_failed_webhook
  ON public.sms_messages;
CREATE TRIGGER enqueue_sms_failed_webhook
  AFTER UPDATE ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_sms_failed_webhook();

CREATE OR REPLACE FUNCTION public.claim_webhook_deliveries(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID,
  webhook_id UUID,
  endpoint_url TEXT,
  signing_secret TEXT,
  event_type TEXT,
  payload JSONB,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.webhook_deliveries delivery
    JOIN public.company_webhooks webhook ON webhook.id = delivery.webhook_id
    WHERE delivery.status IN ('queued', 'failed')
      AND delivery.attempts < delivery.max_attempts
      AND delivery.next_attempt_at <= now()
      AND webhook.is_active = true
    ORDER BY delivery.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.webhook_deliveries delivery
    SET status = 'processing',
        attempts = delivery.attempts + 1,
        locked_at = now(),
        updated_at = now(),
        error = NULL
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.*
  )
  SELECT
    claimed.id,
    webhook.id,
    webhook.endpoint_url,
    webhook.signing_secret,
    claimed.event_type,
    claimed.payload,
    claimed.attempts
  FROM claimed
  JOIN public.company_webhooks webhook ON webhook.id = claimed.webhook_id
  WHERE webhook.is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_webhook_delivery(
  p_delivery_id UUID,
  p_success BOOLEAN,
  p_response_status INTEGER,
  p_response_body TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_webhook_id UUID;
  v_next_status TEXT;
BEGIN
  SELECT delivery.webhook_id INTO v_webhook_id
  FROM public.webhook_deliveries delivery
  WHERE delivery.id = p_delivery_id;

  IF v_webhook_id IS NULL THEN
    RETURN false;
  END IF;

  v_next_status := CASE WHEN p_success THEN 'success' ELSE 'failed' END;

  UPDATE public.webhook_deliveries delivery
  SET status = v_next_status,
      delivered_at = CASE WHEN p_success THEN now() ELSE delivery.delivered_at END,
      response_status = p_response_status,
      response_body = left(COALESCE(p_response_body, ''), 2000),
      error = left(COALESCE(p_error, ''), 1000),
      next_attempt_at = CASE
        WHEN p_success THEN delivery.next_attempt_at
        ELSE now() + make_interval(mins => LEAST(60, GREATEST(1, delivery.attempts * 5)))
      END,
      locked_at = NULL,
      updated_at = now()
  WHERE delivery.id = p_delivery_id;

  UPDATE public.company_webhooks webhook
  SET last_delivery_status = v_next_status,
      last_delivery_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, ''), 1000) END,
      last_delivered_at = CASE WHEN p_success THEN now() ELSE webhook.last_delivered_at END,
      updated_at = now()
  WHERE webhook.id = v_webhook_id;

  RETURN true;
END;
$$;

REVOKE ALL ON public.webhook_deliveries FROM anon;
REVOKE ALL ON public.webhook_deliveries FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_deliveries TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_company_webhook_event(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_webhook_deliveries(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_webhook_delivery(UUID, BOOLEAN, INTEGER, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_company_webhook_event(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_webhook_deliveries(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_webhook_delivery(UUID, BOOLEAN, INTEGER, TEXT, TEXT) TO service_role;
