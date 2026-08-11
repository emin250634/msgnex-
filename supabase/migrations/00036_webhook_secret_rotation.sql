-- Webhook signing secret rotation and one-time secret reveal support.
-- Secrets are returned only from create/rotate RPCs; list RPCs never expose them.

ALTER TABLE public.company_webhooks
  ADD COLUMN IF NOT EXISTS previous_signing_secret TEXT,
  ADD COLUMN IF NOT EXISTS secret_rotated_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.list_company_webhooks();

CREATE OR REPLACE FUNCTION public.list_company_webhooks()
RETURNS TABLE (
  id UUID,
  endpoint_url TEXT,
  events TEXT[],
  is_active BOOLEAN,
  has_previous_signing_secret BOOLEAN,
  secret_rotated_at TIMESTAMPTZ,
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
    webhook.previous_signing_secret IS NOT NULL,
    webhook.secret_rotated_at,
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

DROP FUNCTION IF EXISTS public.create_company_webhook(TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.create_company_webhook(
  p_endpoint_url TEXT,
  p_events TEXT[]
)
RETURNS TABLE (
  id UUID,
  signing_secret TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_events TEXT[] := public.normalize_webhook_events(p_events);
  v_webhook_id UUID;
  v_signing_secret TEXT;
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
  RETURNING company_webhooks.id, company_webhooks.signing_secret
  INTO v_webhook_id, v_signing_secret;

  INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
  VALUES (
    v_user_id,
    'customer',
    'webhook.created',
    'company_webhook',
    v_webhook_id,
    v_company_id,
    jsonb_build_object('endpoint_url', trim(p_endpoint_url), 'events', v_events)
  );

  RETURN QUERY SELECT v_webhook_id, v_signing_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_company_webhook_secret(p_webhook_id UUID)
RETURNS TABLE (
  id UUID,
  signing_secret TEXT,
  secret_rotated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_webhook_id UUID;
  v_signing_secret TEXT;
  v_rotated_at TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF NOT public.company_has_feature(v_company_id, 'webhook') THEN
    RAISE EXCEPTION 'Webhook access requires Agency plan';
  END IF;

  UPDATE public.company_webhooks webhook
  SET previous_signing_secret = webhook.signing_secret,
      signing_secret = encode(extensions.gen_random_bytes(24), 'hex'),
      secret_rotated_at = v_rotated_at,
      updated_at = now()
  WHERE webhook.id = p_webhook_id
    AND webhook.company_id = v_company_id
  RETURNING webhook.id, webhook.signing_secret
  INTO v_webhook_id, v_signing_secret;

  IF v_webhook_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, actor_role, action, target_type, target_id, company_id, metadata)
  VALUES (
    v_user_id,
    'customer',
    'webhook.secret_rotated',
    'company_webhook',
    v_webhook_id,
    v_company_id,
    jsonb_build_object('rotated_at', v_rotated_at)
  );

  RETURN QUERY SELECT v_webhook_id, v_signing_secret, v_rotated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_webhooks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_company_webhook(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_company_webhook_secret(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_company_webhooks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_webhook(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_company_webhook_secret(UUID) TO authenticated;
