-- Enqueue provider.status_updated webhook events from DLR updates.

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
  v_recipient TEXT;
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
  SELECT company_id, recipient, status, (refunded_at IS NOT NULL OR refund_transaction_id IS NOT NULL)
  INTO v_company_id, v_recipient, v_current_status, v_has_refund
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

  PERFORM public.enqueue_company_webhook_event(
    v_company_id,
    'provider.status_updated',
    jsonb_build_object(
      'event', 'provider.status_updated',
      'messageId', p_sms_message_id,
      'campaignId', p_campaign_id,
      'companyId', v_company_id,
      'recipient', v_recipient,
      'previousStatus', v_current_status,
      'messageStatus', v_next_status,
      'normalizedStatus', v_normalized_status,
      'transitionAction', v_transition_action,
      'providerName', v_provider_name,
      'providerBulkId', v_provider_bulk_id,
      'providerMessageId', v_provider_message_id,
      'providerStatusCode', v_provider_status_code,
      'providerStatusText', v_provider_status_text,
      'deliveredAt', CASE WHEN v_next_status = 'delivered' THEN now() ELSE NULL END,
      'failedAt', CASE WHEN v_next_status = 'failed' THEN now() ELSE NULL END,
      'campaignProviderStatus', v_provider_status,
      'occurredAt', COALESCE(p_occurred_at, now())
    )
  );

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
