-- Safe campaign cancellation and stale worker recovery.
-- Queued campaigns can be cancelled with a full refund. Sending campaigns
-- are never retried automatically because the provider may already have
-- accepted the SMS even if the worker did not receive a response.

ALTER TABLE public.sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_status_check;

ALTER TABLE public.sms_campaigns
  ADD CONSTRAINT sms_campaigns_status_check
  CHECK (status IN (
    'draft', 'queued', 'scheduled', 'sending', 'completed', 'failed',
    'cancelled', 'review_required'
  ));

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- Customers can view campaigns but must use controlled RPC functions to mutate them.
DROP POLICY IF EXISTS campaigns_customer_manage ON public.sms_campaigns;
DROP POLICY IF EXISTS campaigns_customer_view ON public.sms_campaigns;
CREATE POLICY campaigns_customer_view ON public.sms_campaigns
  FOR SELECT USING (company_id = public.my_company_id());

CREATE OR REPLACE FUNCTION public.cancel_queued_sms_campaign(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT campaign.company_id
  INTO v_company_id
  FROM public.sms_campaigns campaign
  JOIN public.profiles profile ON profile.company_id = campaign.company_id
  WHERE campaign.id = p_campaign_id
    AND campaign.status = 'queued'
    AND profile.id = v_user_id
    AND profile.role = 'customer'
  FOR UPDATE OF campaign;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Only queued campaigns can be cancelled';
  END IF;

  SELECT COALESCE(sum(credits_cost), 0)
  INTO v_refund
  FROM public.sms_messages
  WHERE company_id = v_company_id
    AND campaign_id = p_campaign_id
    AND status = 'pending';

  UPDATE public.sms_messages
  SET status = 'failed', provider_error = 'Campaign cancelled before sending'
  WHERE company_id = v_company_id
    AND campaign_id = p_campaign_id
    AND status = 'pending';

  UPDATE public.sms_campaigns
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_campaign_id;

  UPDATE public.sms_credits
  SET balance = balance + v_refund, updated_at = now()
  WHERE company_id = v_company_id
  RETURNING balance INTO v_balance;

  IF v_refund > 0 THEN
    INSERT INTO public.credit_transactions (
      company_id, amount, type, note, created_by
    )
    VALUES (
      v_company_id, v_refund, 'refund',
      'Cancelled queued SMS refund (' || v_refund || ' credits)', v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'status', 'cancelled',
    'refund', v_refund,
    'balance', v_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_stale_sending_campaigns(
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_timeout_minutes < 5 OR p_timeout_minutes > 1440 THEN
    RAISE EXCEPTION 'Timeout must be between 5 and 1440 minutes';
  END IF;

  WITH stale AS (
    UPDATE public.sms_campaigns
    SET status = 'review_required',
        review_reason = 'Worker timeout. Provider delivery state must be checked before refund or retry.',
        updated_at = now()
    WHERE status = 'sending'
      AND processing_started_at < now() - make_interval(mins => p_timeout_minutes)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM stale;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_queued_sms_campaign(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_queued_sms_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_stale_sending_campaigns(INTEGER) TO service_role;
