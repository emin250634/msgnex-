-- Agency plan webhook configuration.
-- Delivery worker will be added separately; this phase stores validated endpoints and event subscriptions.

CREATE TABLE IF NOT EXISTS public.company_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  signing_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  last_delivery_status TEXT,
  last_delivery_error TEXT,
  last_delivered_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_webhooks_endpoint_url_check
    CHECK (endpoint_url ~ '^https://'),
  CONSTRAINT company_webhooks_events_check
    CHECK (
      cardinality(events) BETWEEN 1 AND 10
      AND events <@ ARRAY['campaign.completed', 'sms.failed', 'provider.status_updated']::TEXT[]
    ),
  CONSTRAINT company_webhooks_last_delivery_status_check
    CHECK (last_delivery_status IS NULL OR last_delivery_status IN ('pending', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_company_webhooks_company
  ON public.company_webhooks(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_webhooks_active
  ON public.company_webhooks(company_id, is_active);

ALTER TABLE public.company_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_webhooks_admin_all
  ON public.company_webhooks;
CREATE POLICY company_webhooks_admin_all
  ON public.company_webhooks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_company_webhooks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_webhooks_updated_at
  ON public.company_webhooks;
CREATE TRIGGER set_company_webhooks_updated_at
  BEFORE UPDATE ON public.company_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_company_webhooks_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_webhook_events(p_events TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY(
    SELECT DISTINCT trim(event)
    FROM unnest(COALESCE(p_events, ARRAY[]::TEXT[])) event
    WHERE trim(event) <> ''
    ORDER BY trim(event)
  );
$$;

CREATE OR REPLACE FUNCTION public.list_company_webhooks()
RETURNS TABLE (
  id UUID,
  endpoint_url TEXT,
  events TEXT[],
  is_active BOOLEAN,
  last_delivery_status TEXT,
  last_delivery_error TEXT,
  last_delivered_at TIMESTAMPTZ,
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
    webhook.id,
    webhook.endpoint_url,
    webhook.events,
    webhook.is_active,
    webhook.last_delivery_status,
    webhook.last_delivery_error,
    webhook.last_delivered_at,
    webhook.created_at,
    webhook.updated_at
  FROM public.company_webhooks webhook
  WHERE webhook.company_id = v_company_id
  ORDER BY webhook.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_company_webhook(
  p_endpoint_url TEXT,
  p_events TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_events TEXT[] := public.normalize_webhook_events(p_events);
  v_webhook_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF NOT public.company_has_feature(v_company_id, 'webhook') THEN
    RAISE EXCEPTION 'Webhook access requires Agency plan';
  END IF;
  IF p_endpoint_url IS NULL OR p_endpoint_url !~ '^https://' OR length(trim(p_endpoint_url)) > 500 THEN
    RAISE EXCEPTION 'Webhook URL must be a valid https URL';
  END IF;
  IF cardinality(v_events) = 0 OR NOT (v_events <@ ARRAY['campaign.completed', 'sms.failed', 'provider.status_updated']::TEXT[]) THEN
    RAISE EXCEPTION 'Webhook events are invalid';
  END IF;

  INSERT INTO public.company_webhooks(company_id, endpoint_url, events, created_by)
  VALUES (v_company_id, trim(p_endpoint_url), v_events, v_user_id)
  RETURNING id INTO v_webhook_id;

  RETURN v_webhook_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_company_webhook(
  p_webhook_id UUID,
  p_endpoint_url TEXT,
  p_events TEXT[],
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID := public.get_primary_company_id();
  v_events TEXT[] := public.normalize_webhook_events(p_events);
BEGIN
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF NOT public.company_has_feature(v_company_id, 'webhook') THEN
    RAISE EXCEPTION 'Webhook access requires Agency plan';
  END IF;
  IF p_endpoint_url IS NULL OR p_endpoint_url !~ '^https://' OR length(trim(p_endpoint_url)) > 500 THEN
    RAISE EXCEPTION 'Webhook URL must be a valid https URL';
  END IF;
  IF cardinality(v_events) = 0 OR NOT (v_events <@ ARRAY['campaign.completed', 'sms.failed', 'provider.status_updated']::TEXT[]) THEN
    RAISE EXCEPTION 'Webhook events are invalid';
  END IF;

  UPDATE public.company_webhooks webhook
  SET endpoint_url = trim(p_endpoint_url),
      events = v_events,
      is_active = COALESCE(p_is_active, true)
  WHERE webhook.id = p_webhook_id
    AND webhook.company_id = v_company_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_company_webhook(p_webhook_id UUID)
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

  DELETE FROM public.company_webhooks webhook
  WHERE webhook.id = p_webhook_id
    AND webhook.company_id = v_company_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON public.company_webhooks FROM anon;
REVOKE ALL ON public.company_webhooks FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_webhooks TO authenticated;

REVOKE ALL ON FUNCTION public.normalize_webhook_events(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_company_webhooks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_company_webhook(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_company_webhook(UUID, TEXT, TEXT[], BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_company_webhook(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_company_webhooks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_webhook(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_webhook(UUID, TEXT, TEXT[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_webhook(UUID) TO authenticated;
