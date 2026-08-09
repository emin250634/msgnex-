-- Plan usage limits for commercial packaging.

CREATE OR REPLACE FUNCTION public.company_plan_limit(p_plan TEXT, p_limit TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_limit
    WHEN 'users' THEN CASE p_plan WHEN 'agency' THEN 50 WHEN 'professional' THEN 10 ELSE 2 END
    WHEN 'contacts' THEN CASE p_plan WHEN 'agency' THEN 100000 WHEN 'professional' THEN 10000 ELSE 500 END
    WHEN 'campaign_recipients' THEN CASE p_plan WHEN 'agency' THEN 1000 WHEN 'professional' THEN 1000 ELSE 250 END
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_plan_limits()
RETURNS TABLE (
  company_id UUID,
  plan TEXT,
  user_limit INTEGER,
  contact_limit INTEGER,
  campaign_recipient_limit INTEGER,
  current_users INTEGER,
  current_contacts INTEGER
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
    company.id,
    company.plan,
    public.company_plan_limit(company.plan, 'users'),
    public.company_plan_limit(company.plan, 'contacts'),
    public.company_plan_limit(company.plan, 'campaign_recipients'),
    (
      SELECT count(*)::INTEGER
      FROM public.company_users membership
      WHERE membership.company_id = company.id
        AND membership.is_active = true
    ),
    (
      SELECT count(*)::INTEGER
      FROM public.contacts contact
      WHERE contact.company_id = company.id
    )
  FROM public.companies company
  WHERE company.id = v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contact_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan TEXT;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  SELECT company.plan INTO v_plan
  FROM public.companies company
  WHERE company.id = NEW.company_id
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active');

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Active company required';
  END IF;

  v_limit := public.company_plan_limit(v_plan, 'contacts');

  SELECT count(*)::INTEGER INTO v_count
  FROM public.contacts contact
  WHERE contact.company_id = NEW.company_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Contact limit reached for current plan';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_contacts_plan_limit
  ON public.contacts;
CREATE TRIGGER enforce_contacts_plan_limit
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_plan_limit();

CREATE OR REPLACE FUNCTION public.queue_sms_campaign(p_message TEXT, p_recipients TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_sender_id TEXT;
  v_campaign_id UUID;
  v_segments INTEGER;
  v_units INTEGER;
  v_skipped INTEGER;
  v_recipients TEXT[];
  v_plan TEXT;
  v_recipient_limit INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 OR length(p_message) > 612 THEN
    RAISE EXCEPTION 'Message must contain 1 to 612 characters';
  END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 OR cardinality(p_recipients) > 1000 THEN
    RAISE EXCEPTION 'Recipient count must be between 1 and 1000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_recipients) recipient
    WHERE recipient !~ '^[0-9]{10,15}$'
  ) THEN
    RAISE EXCEPTION 'Invalid recipient phone number';
  END IF;

  SELECT company.plan INTO v_plan
  FROM public.companies company
  WHERE company.id = v_company_id;
  v_recipient_limit := public.company_plan_limit(COALESCE(v_plan, 'starter'), 'campaign_recipients');

  SELECT setting.sender_header INTO v_sender_id
  FROM public.company_provider_settings setting
  JOIN public.companies company ON company.id = setting.company_id
  WHERE setting.company_id = v_company_id
    AND setting.provider_name = 'netgsm'
    AND setting.is_active = true
    AND setting.usercode IS NOT NULL
    AND setting.encrypted_secret IS NOT NULL
    AND length(trim(setting.sender_header)) > 0
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active');

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Active company provider connection required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT recipient
    FROM unnest(p_recipients) recipient
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.suppression_list suppression
      WHERE suppression.company_id = v_company_id
        AND suppression.phone = recipient
    )
  ) INTO v_recipients;

  v_skipped := cardinality(ARRAY(
    SELECT DISTINCT recipient FROM unnest(p_recipients) recipient
  )) - cardinality(v_recipients);

  IF cardinality(v_recipients) = 0 THEN RAISE EXCEPTION 'All recipients are suppressed'; END IF;
  IF cardinality(v_recipients) > v_recipient_limit THEN
    RAISE EXCEPTION 'Campaign recipient limit exceeded for current plan';
  END IF;

  v_segments := public.sms_segment_count(p_message);
  v_units := cardinality(v_recipients) * v_segments;

  INSERT INTO public.sms_campaigns(
    company_id, name, message, total_recipients, skipped_recipients, status, queued_at
  )
  VALUES (
    v_company_id,
    'Panel SMS ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    p_message,
    cardinality(v_recipients),
    v_skipped,
    'queued',
    now()
  )
  RETURNING id INTO v_campaign_id;

  INSERT INTO public.sms_messages(
    company_id, campaign_id, sender_id, recipient, message, status, credits_cost
  )
  SELECT v_company_id, v_campaign_id, v_sender_id, recipient, p_message, 'pending', v_segments
  FROM unnest(v_recipients) recipient;

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'segments', v_segments,
    'estimated_provider_units', v_units,
    'skipped_recipients', v_skipped,
    'recipient_limit', v_recipient_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.company_plan_limit(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_plan_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_plan_limit(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_plan_limits() TO authenticated;
