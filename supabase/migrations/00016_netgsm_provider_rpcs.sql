-- ============================================================
-- MSGNEX - Netgsm provider RPC foundation
-- Phase 3: queued worker payload, provider completion metadata,
-- financially idempotent submit refunds, and DLR event recording.
-- No RLS policy changes.
-- No application code changes.
-- No status constraint changes.
-- ============================================================

-- 1. Include company_id and credits_cost in the queued worker payload.
-- Existing consumers can keep using campaign_id, sender_id, message, messages.

CREATE OR REPLACE FUNCTION public.claim_queued_sms_campaign()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign_id UUID;
  v_payload JSONB;
BEGIN
  SELECT campaign.id INTO v_campaign_id
  FROM public.sms_campaigns campaign
  WHERE campaign.status = 'queued'
  ORDER BY campaign.queued_at ASC, campaign.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_campaign_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.sms_campaigns
  SET status = 'sending',
      processing_started_at = now(),
      updated_at = now()
  WHERE id = v_campaign_id;

  SELECT jsonb_build_object(
    'campaign_id', campaign.id,
    'company_id', campaign.company_id,
    'sender_id', min(message.sender_id),
    'message', campaign.message,
    'messages', jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'recipient', message.recipient,
        'credits_cost', message.credits_cost
      )
      ORDER BY message.created_at ASC
    )
  )
  INTO v_payload
  FROM public.sms_campaigns campaign
  JOIN public.sms_messages message ON message.campaign_id = campaign.id
  WHERE campaign.id = v_campaign_id
    AND message.status = 'pending'
  GROUP BY campaign.id, campaign.company_id, campaign.message;

  RETURN v_payload;
END;
$$;

-- 2. Complete provider submit for queued campaigns.
-- Backward-compatible input:
--   [{ id, success, provider_message_id, error }]
--
-- Netgsm-aware input:
--   [{
--      id,
--      success,
--      accepted,
--      normalized_status,
--      provider_name,
--      provider_bulk_id,
--      provider_message_id,
--      provider_status_code,
--      provider_status_text,
--      error,
--      raw_status
--   }]
--
-- Since this phase does not change status constraints, provider accepted
-- messages are stored as status = 'sent' with is_final = false. Campaign
-- status remains in the existing constraint set; DLR waiting is represented
-- with provider_status = 'awaiting_dlr'.

CREATE OR REPLACE FUNCTION public.complete_queued_sms_campaign(
  p_campaign_id UUID,
  p_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID;
  v_total INTEGER;
  v_success INTEGER;
  v_failed INTEGER;
  v_pending INTEGER;
  v_refund INTEGER;
  v_balance INTEGER;
  v_provider_name TEXT;
  v_provider_bulk_id TEXT;
  v_provider_status_code TEXT;
  v_provider_status_text TEXT;
  v_campaign_status TEXT;
  v_provider_status TEXT;
  v_refund_transaction_id UUID;
BEGIN
  SELECT company_id, total_recipients
  INTO v_company_id, v_total
  FROM public.sms_campaigns
  WHERE id = p_campaign_id
    AND status = 'sending';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Queued campaign not found';
  END IF;

  WITH results AS (
    SELECT *
    FROM jsonb_to_recordset(p_results) AS result(
      id UUID,
      success BOOLEAN,
      accepted BOOLEAN,
      normalized_status TEXT,
      provider_name TEXT,
      provider_bulk_id TEXT,
      provider_message_id TEXT,
      provider_status_code TEXT,
      provider_status_text TEXT,
      error TEXT,
      raw_status JSONB
    )
  ), normalized AS (
    SELECT
      id,
      COALESCE(NULLIF(trim(provider_name), ''), 'unknown') AS provider_name,
      NULLIF(trim(provider_bulk_id), '') AS provider_bulk_id,
      NULLIF(trim(provider_message_id), '') AS provider_message_id,
      NULLIF(trim(provider_status_code), '') AS provider_status_code,
      NULLIF(trim(provider_status_text), '') AS provider_status_text,
      NULLIF(trim(error), '') AS error,
      raw_status,
      CASE
        WHEN normalized_status IN ('delivered', 'sent') THEN normalized_status
        WHEN normalized_status = 'failed' THEN 'failed'
        WHEN accepted IS TRUE THEN 'sent'
        WHEN success IS TRUE THEN 'sent'
        ELSE 'failed'
      END AS next_status
    FROM results
  )
  UPDATE public.sms_messages message
  SET status = normalized.next_status,
      provider_name = normalized.provider_name,
      provider_bulk_id = normalized.provider_bulk_id,
      provider_message_id = normalized.provider_message_id,
      provider_status_code = normalized.provider_status_code,
      provider_status_text = normalized.provider_status_text,
      provider_error = normalized.error,
      provider_raw_status = normalized.raw_status,
      accepted_at = CASE
        WHEN normalized.next_status IN ('sent', 'delivered')
        THEN COALESCE(message.accepted_at, now())
        ELSE message.accepted_at
      END,
      sent_at = CASE
        WHEN normalized.next_status IN ('sent', 'delivered')
        THEN COALESCE(message.sent_at, now())
        ELSE message.sent_at
      END,
      delivered_at = CASE
        WHEN normalized.next_status = 'delivered'
        THEN COALESCE(message.delivered_at, now())
        ELSE message.delivered_at
      END,
      failed_at = CASE
        WHEN normalized.next_status = 'failed'
        THEN COALESCE(message.failed_at, now())
        ELSE message.failed_at
      END,
      is_final = normalized.next_status IN ('delivered', 'failed')
  FROM normalized
  WHERE message.id = normalized.id
    AND message.company_id = v_company_id
    AND message.campaign_id = p_campaign_id
    AND message.status = 'pending';

  SELECT
    count(*) FILTER (WHERE status IN ('sent', 'delivered')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'sent' AND is_final = false),
    COALESCE(sum(credits_cost) FILTER (
      WHERE status = 'failed'
        AND refunded_at IS NULL
        AND refund_transaction_id IS NULL
    ), 0),
    max(provider_name),
    max(provider_bulk_id),
    max(provider_status_code),
    max(provider_status_text)
  INTO
    v_success,
    v_failed,
    v_pending,
    v_refund,
    v_provider_name,
    v_provider_bulk_id,
    v_provider_status_code,
    v_provider_status_text
  FROM public.sms_messages
  WHERE company_id = v_company_id
    AND campaign_id = p_campaign_id;

  IF v_success + v_failed <> v_total THEN
    RAISE EXCEPTION 'Incomplete provider result set';
  END IF;

  IF v_refund > 0 THEN
    INSERT INTO public.credit_transactions (company_id, amount, type, note)
    VALUES (
      v_company_id,
      v_refund,
      'refund',
      'Failed queued SMS provider-submit refund (' || v_refund || ' credits)'
    )
    RETURNING id INTO v_refund_transaction_id;

    UPDATE public.sms_messages
    SET refunded_at = now(),
        refund_transaction_id = v_refund_transaction_id
    WHERE company_id = v_company_id
      AND campaign_id = p_campaign_id
      AND status = 'failed'
      AND refunded_at IS NULL
      AND refund_transaction_id IS NULL;

    UPDATE public.sms_credits
    SET balance = balance + v_refund,
        updated_at = now()
    WHERE company_id = v_company_id
    RETURNING balance INTO v_balance;
  ELSE
    SELECT balance INTO v_balance
    FROM public.sms_credits
    WHERE company_id = v_company_id;
  END IF;

  v_campaign_status := CASE
    WHEN v_success > 0 THEN 'completed'
    ELSE 'failed'
  END;

  v_provider_status := CASE
    WHEN v_success > 0 AND v_failed > 0 THEN 'partially_submitted'
    WHEN v_pending > 0 THEN 'awaiting_dlr'
    WHEN v_success > 0 THEN 'awaiting_dlr'
    ELSE 'failed'
  END;

  UPDATE public.sms_campaigns
  SET success_count = v_success,
      fail_count = v_failed,
      status = v_campaign_status,
      provider_name = v_provider_name,
      provider_bulk_id = v_provider_bulk_id,
      provider_status = v_provider_status,
      provider_status_code = v_provider_status_code,
      provider_status_text = v_provider_status_text,
      provider_raw_response = p_results,
      provider_submitted_at = COALESCE(provider_submitted_at, now()),
      provider_success_count = v_success,
      provider_failed_count = v_failed,
      provider_pending_count = v_pending,
      sent_at = now(),
      updated_at = now()
  WHERE id = p_campaign_id;

  INSERT INTO public.sms_provider_dispatches (
    campaign_id,
    company_id,
    provider_name,
    provider_bulk_id,
    response_payload,
    status,
    provider_status_code,
    provider_status_text,
    submitted_at,
    completed_at
  )
  VALUES (
    p_campaign_id,
    v_company_id,
    COALESCE(v_provider_name, 'unknown'),
    v_provider_bulk_id,
    p_results,
    CASE
      WHEN v_success > 0 THEN 'awaiting_dlr'
      ELSE 'failed'
    END,
    v_provider_status_code,
    v_provider_status_text,
    now(),
    CASE WHEN v_success > 0 THEN NULL ELSE now() END
  );

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'status', v_campaign_status,
    'providerStatus', v_provider_status,
    'success', v_success,
    'fail', v_failed,
    'pending', v_pending,
    'refundedCredits', v_refund,
    'balance', v_balance,
    'provider', v_provider_name,
    'providerBulkId', v_provider_bulk_id
  );
END;
$$;

-- 3. Record a provider DLR event and update current message/campaign status.
-- Duplicate DLR events are no-op. Refunds are intentionally not performed
-- here. Provider-billing-aware, idempotent DLR refunds should be handled by a
-- later dedicated RPC that checks refunded_at and refund_transaction_id.

CREATE OR REPLACE FUNCTION public.record_sms_delivery_event(
  p_sms_message_id UUID,
  p_campaign_id UUID,
  p_provider_name TEXT,
  p_provider_bulk_id TEXT,
  p_provider_message_id TEXT,
  p_provider_status_code TEXT,
  p_provider_status_text TEXT DEFAULT NULL,
  p_raw_payload JSONB DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID;
  v_normalized_status TEXT;
  v_current_status TEXT;
  v_next_status TEXT;
  v_success INTEGER;
  v_failed INTEGER;
  v_pending INTEGER;
  v_total INTEGER;
  v_campaign_status TEXT;
  v_provider_status TEXT;
  v_transition_action TEXT := 'applied';
  v_has_refund BOOLEAN;
  v_duplicate_exists BOOLEAN;
  v_provider_name TEXT := COALESCE(NULLIF(trim(p_provider_name), ''), 'unknown');
  v_provider_bulk_id TEXT := NULLIF(trim(p_provider_bulk_id), '');
  v_provider_message_id TEXT := NULLIF(trim(p_provider_message_id), '');
  v_provider_status_code TEXT := NULLIF(trim(p_provider_status_code), '');
  v_provider_status_text TEXT := NULLIF(trim(p_provider_status_text), '');
BEGIN
  SELECT company_id, status, (refunded_at IS NOT NULL OR refund_transaction_id IS NOT NULL)
  INTO v_company_id, v_current_status, v_has_refund
  FROM public.sms_messages
  WHERE id = p_sms_message_id
    AND campaign_id = p_campaign_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'SMS message not found for campaign';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.sms_delivery_events event
    WHERE event.sms_message_id = p_sms_message_id
      AND event.campaign_id = p_campaign_id
      AND event.provider_name = v_provider_name
      AND event.provider_bulk_id IS NOT DISTINCT FROM v_provider_bulk_id
      AND event.provider_message_id IS NOT DISTINCT FROM v_provider_message_id
      AND event.provider_status_code IS NOT DISTINCT FROM v_provider_status_code
      AND event.occurred_at IS NOT DISTINCT FROM p_occurred_at
  )
  INTO v_duplicate_exists;

  IF v_duplicate_exists THEN
    SELECT
      count(*) FILTER (WHERE status = 'delivered'),
      count(*) FILTER (WHERE status = 'failed'),
      count(*) FILTER (WHERE is_final = false),
      count(*)
    INTO v_success, v_failed, v_pending, v_total
    FROM public.sms_messages
    WHERE campaign_id = p_campaign_id
      AND company_id = v_company_id;

    RETURN jsonb_build_object(
      'campaignId', p_campaign_id,
      'messageId', p_sms_message_id,
      'duplicate', true,
      'transitionAction', 'duplicate_noop',
      'messageStatus', v_current_status,
      'success', v_success,
      'fail', v_failed,
      'pending', v_pending,
      'total', v_total
    );
  END IF;

  v_normalized_status := public.normalize_provider_delivery_status(
    v_provider_name,
    v_provider_status_code
  );

  v_next_status := CASE
    WHEN v_current_status = 'delivered' AND v_normalized_status = 'failed' THEN 'delivered'
    WHEN v_current_status = 'failed' AND v_normalized_status = 'delivered' AND v_has_refund THEN 'failed'
    WHEN v_normalized_status = 'pending' AND v_current_status IN ('sent', 'delivered', 'failed') THEN v_current_status
    ELSE v_normalized_status
  END;

  v_transition_action := CASE
    WHEN v_current_status = 'delivered' AND v_normalized_status = 'failed' THEN 'ignored_delivered_to_failed'
    WHEN v_current_status = 'failed' AND v_normalized_status = 'delivered' AND v_has_refund THEN 'review_delivery_after_refund'
    WHEN v_normalized_status = 'pending' AND v_current_status IN ('sent', 'delivered', 'failed') THEN 'ignored_pending_regression'
    ELSE 'applied'
  END;

  INSERT INTO public.sms_delivery_events (
    sms_message_id,
    campaign_id,
    company_id,
    provider_name,
    provider_bulk_id,
    provider_message_id,
    provider_status_code,
    provider_status_text,
    normalized_status,
    raw_payload,
    occurred_at
  )
  VALUES (
    p_sms_message_id,
    p_campaign_id,
    v_company_id,
    v_provider_name,
    v_provider_bulk_id,
    v_provider_message_id,
    v_provider_status_code,
    v_provider_status_text,
    v_normalized_status,
    p_raw_payload,
    p_occurred_at
  );

  UPDATE public.sms_messages
  SET status = v_next_status,
      provider_name = v_provider_name,
      provider_bulk_id = COALESCE(v_provider_bulk_id, provider_bulk_id),
      provider_message_id = COALESCE(v_provider_message_id, provider_message_id),
      provider_status_code = v_provider_status_code,
      provider_status_text = v_provider_status_text,
      provider_raw_status = p_raw_payload,
      last_dlr_checked_at = now(),
      dlr_attempt_count = dlr_attempt_count + 1,
      delivered_at = CASE
        WHEN v_next_status = 'delivered'
        THEN COALESCE(delivered_at, now())
        ELSE delivered_at
      END,
      failed_at = CASE
        WHEN v_next_status = 'failed'
        THEN COALESCE(failed_at, now())
        ELSE failed_at
      END,
      is_final = v_next_status IN ('delivered', 'failed')
  WHERE id = p_sms_message_id
    AND campaign_id = p_campaign_id;

  SELECT
    count(*) FILTER (WHERE status = 'delivered'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE is_final = false),
    count(*)
  INTO v_success, v_failed, v_pending, v_total
  FROM public.sms_messages
  WHERE campaign_id = p_campaign_id
    AND company_id = v_company_id;

  IF v_transition_action = 'review_delivery_after_refund' THEN
    v_campaign_status := 'review_required';
    v_provider_status := 'delivery_after_refund_review';
  ELSE
    v_campaign_status := CASE
      WHEN v_pending > 0 THEN 'completed'
      WHEN v_success > 0 THEN 'completed'
      ELSE 'failed'
    END;

    v_provider_status := CASE
      WHEN v_pending > 0 THEN 'awaiting_dlr'
      WHEN v_success > 0 AND v_failed > 0 THEN 'partially_delivered'
      WHEN v_success > 0 THEN 'delivered'
      ELSE 'failed'
    END;
  END IF;

  UPDATE public.sms_campaigns
  SET success_count = v_success,
      fail_count = v_failed,
      status = v_campaign_status,
      provider_success_count = v_success,
      provider_failed_count = v_failed,
      provider_pending_count = v_pending,
      provider_status = v_provider_status,
      dlr_last_checked_at = now(),
      dlr_check_count = dlr_check_count + 1,
      dlr_completed_at = CASE
        WHEN v_pending = 0 THEN COALESCE(dlr_completed_at, now())
        ELSE dlr_completed_at
      END,
      updated_at = now()
  WHERE id = p_campaign_id
    AND company_id = v_company_id;

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'messageId', p_sms_message_id,
    'duplicate', false,
    'normalizedStatus', v_normalized_status,
    'messageStatus', v_next_status,
    'transitionAction', v_transition_action,
    'campaignStatus', v_campaign_status,
    'providerStatus', v_provider_status,
    'success', v_success,
    'fail', v_failed,
    'pending', v_pending,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_sms_delivery_event(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_sms_delivery_event(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_queued_sms_campaign() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_queued_sms_campaign(UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_queued_sms_campaign() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_queued_sms_campaign(UUID, JSONB) TO service_role;
