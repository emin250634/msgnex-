-- Queue panel campaigns and let a backend worker process them safely.

ALTER TABLE public.sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_status_check;

ALTER TABLE public.sms_campaigns
  ADD CONSTRAINT sms_campaigns_status_check
  CHECK (status IN ('draft', 'queued', 'scheduled', 'sending', 'completed', 'failed'));

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_queue
  ON public.sms_campaigns(status, queued_at);

CREATE OR REPLACE FUNCTION public.queue_sms_campaign(
  p_message TEXT,
  p_recipients TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_sender_id TEXT;
  v_campaign_id UUID;
  v_segments INTEGER;
  v_cost INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN
    RAISE EXCEPTION 'Message must contain 1 to 612 characters';
  END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN
    RAISE EXCEPTION 'Recipient count must be between 1 and 1000';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recipients) AS recipient WHERE recipient !~ '^[0-9]{10,15}$') THEN
    RAISE EXCEPTION 'Invalid recipient phone number';
  END IF;

  SELECT profile.company_id, company.sender_name
  INTO v_company_id, v_sender_id
  FROM public.profiles profile
  JOIN public.companies company ON company.id = profile.company_id
  WHERE profile.id = v_user_id
    AND profile.role = 'customer'
    AND profile.is_active = true
    AND company.is_active = true
    AND company.sender_approved = true
    AND length(trim(company.sender_name)) > 0;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Active company and approved sender ID required'; END IF;

  v_segments := public.sms_segment_count(p_message);
  v_cost := cardinality(p_recipients) * v_segments;

  UPDATE public.sms_credits
  SET balance = balance - v_cost, updated_at = now()
  WHERE company_id = v_company_id AND balance >= v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  INSERT INTO public.sms_campaigns (
    company_id, name, message, total_recipients, status, queued_at
  )
  VALUES (
    v_company_id,
    'Panel SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    p_message,
    cardinality(p_recipients),
    'queued',
    now()
  )
  RETURNING id INTO v_campaign_id;

  INSERT INTO public.sms_messages (
    company_id, campaign_id, sender_id, recipient, message, status, credits_cost
  )
  SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments
  FROM unnest(p_recipients) AS recipient;

  INSERT INTO public.credit_transactions (
    company_id, amount, type, note, created_by
  )
  VALUES (
    v_company_id, -v_cost, 'deduct',
    'Queued SMS credit reservation (' || v_cost || ' credits)', v_user_id
  );

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'segments', v_segments,
    'reserved_credits', v_cost,
    'balance', (SELECT balance FROM public.sms_credits WHERE company_id = v_company_id)
  );
END;
$$;

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
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_campaign_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.sms_campaigns
  SET status = 'sending', processing_started_at = now(), updated_at = now()
  WHERE id = v_campaign_id;

  SELECT jsonb_build_object(
    'campaign_id', campaign.id,
    'sender_id', min(message.sender_id),
    'message', campaign.message,
    'messages', jsonb_agg(
      jsonb_build_object('id', message.id, 'recipient', message.recipient)
      ORDER BY message.created_at ASC
    )
  )
  INTO v_payload
  FROM public.sms_campaigns campaign
  JOIN public.sms_messages message ON message.campaign_id = campaign.id
  WHERE campaign.id = v_campaign_id AND message.status = 'pending'
  GROUP BY campaign.id, campaign.message;

  RETURN v_payload;
END;
$$;

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
  v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  SELECT company_id, total_recipients
  INTO v_company_id, v_total
  FROM public.sms_campaigns
  WHERE id = p_campaign_id AND status = 'sending';

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Queued campaign not found'; END IF;

  WITH results AS (
    SELECT * FROM jsonb_to_recordset(p_results) AS result(
      id UUID, success BOOLEAN, provider_message_id TEXT, error TEXT
    )
  )
  UPDATE public.sms_messages message
  SET status = CASE WHEN result.success THEN 'sent' ELSE 'failed' END,
      provider_message_id = result.provider_message_id,
      provider_error = result.error,
      sent_at = CASE WHEN result.success THEN now() ELSE NULL END
  FROM results result
  WHERE message.id = result.id
    AND message.company_id = v_company_id
    AND message.campaign_id = p_campaign_id
    AND message.status = 'pending';

  SELECT count(*) FILTER (WHERE status = 'sent'),
         count(*) FILTER (WHERE status = 'failed'),
         COALESCE(sum(credits_cost) FILTER (WHERE status = 'failed'), 0)
  INTO v_success, v_failed, v_refund
  FROM public.sms_messages
  WHERE company_id = v_company_id AND campaign_id = p_campaign_id;

  IF v_success + v_failed <> v_total THEN RAISE EXCEPTION 'Incomplete provider result set'; END IF;

  IF v_refund > 0 THEN
    UPDATE public.sms_credits
    SET balance = balance + v_refund, updated_at = now()
    WHERE company_id = v_company_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_transactions (company_id, amount, type, note)
    VALUES (v_company_id, v_refund, 'refund', 'Failed queued SMS refund (' || v_refund || ' credits)');
  ELSE
    SELECT balance INTO v_balance FROM public.sms_credits WHERE company_id = v_company_id;
  END IF;

  UPDATE public.sms_campaigns
  SET success_count = v_success,
      fail_count = v_failed,
      status = CASE WHEN v_success > 0 THEN 'completed' ELSE 'failed' END,
      sent_at = now(),
      updated_at = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'success', v_success,
    'fail', v_failed,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.queue_sms_campaign(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_queued_sms_campaign() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_queued_sms_campaign(UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.queue_sms_campaign(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_queued_sms_campaign() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_queued_sms_campaign(UUID, JSONB) TO service_role;
