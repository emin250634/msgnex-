-- ============================================================
-- MSGNEX - Netgsm provider indexes and helpers
-- Phase 2: provider indexes and status normalization helper.
-- No RPC changes.
-- No RLS policy changes.
-- No status constraint changes.
-- ============================================================

-- 1. Campaign provider lookup indexes.

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_provider_bulk
  ON public.sms_campaigns(provider_name, provider_bulk_id)
  WHERE provider_bulk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_provider_status
  ON public.sms_campaigns(provider_name, provider_status)
  WHERE provider_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_dlr_pending
  ON public.sms_campaigns(status, dlr_last_checked_at)
  WHERE provider_name IS NOT NULL
    AND dlr_completed_at IS NULL;

-- 2. Message provider lookup indexes.

CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_bulk
  ON public.sms_messages(provider_name, provider_bulk_id)
  WHERE provider_bulk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_message
  ON public.sms_messages(provider_name, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_dlr_pending
  ON public.sms_messages(status, last_dlr_checked_at)
  WHERE is_final = false
    AND provider_name IS NOT NULL;

-- 3. Provider dispatch lookup indexes.

CREATE INDEX IF NOT EXISTS idx_sms_provider_dispatches_campaign
  ON public.sms_provider_dispatches(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_provider_dispatches_provider_bulk
  ON public.sms_provider_dispatches(provider_name, provider_bulk_id)
  WHERE provider_bulk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_provider_dispatches_status
  ON public.sms_provider_dispatches(status, updated_at DESC);

-- 4. Delivery event lookup indexes.

CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_message
  ON public.sms_delivery_events(sms_message_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_campaign
  ON public.sms_delivery_events(campaign_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_bulk
  ON public.sms_delivery_events(provider_name, provider_bulk_id, received_at DESC)
  WHERE provider_bulk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_received
  ON public.sms_delivery_events(received_at DESC);

-- 5. Provider delivery status normalization helper.
-- This phase does not change sms_messages.status constraints, so the helper
-- intentionally returns only currently valid message statuses:
-- pending, sent, delivered, failed.

CREATE OR REPLACE FUNCTION public.normalize_provider_delivery_status(
  p_provider_name TEXT,
  p_provider_status_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF lower(COALESCE(p_provider_name, '')) = 'netgsm' THEN
    RETURN CASE COALESCE(p_provider_status_code, '')
      WHEN '0' THEN 'pending'
      WHEN '1' THEN 'delivered'
      WHEN '2' THEN 'failed'
      WHEN '3' THEN 'failed'
      WHEN '4' THEN 'failed'
      WHEN '11' THEN 'failed'
      WHEN '12' THEN 'failed'
      WHEN '13' THEN 'failed'
      WHEN '15' THEN 'failed'
      WHEN '16' THEN 'failed'
      WHEN '17' THEN 'failed'
      WHEN '103' THEN 'failed'
      ELSE 'failed'
    END;
  END IF;

  RETURN CASE COALESCE(lower(p_provider_status_code), '')
    WHEN 'pending' THEN 'pending'
    WHEN 'sent' THEN 'sent'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'failed'
    ELSE 'failed'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_provider_delivery_status(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_provider_delivery_status(TEXT, TEXT) TO authenticated;
