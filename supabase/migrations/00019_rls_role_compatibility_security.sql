-- ============================================================
-- MSGNEX - RLS / role model compatibility and security hardening
-- Company access is based on accepted, active company_users rows.
-- ============================================================

-- Active admins only. SECURITY DEFINER avoids RLS recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
      AND profile.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users membership
    JOIN public.companies company ON company.id = membership.company_id
    WHERE membership.user_id = auth.uid()
      AND membership.company_id = p_company_id
      AND membership.is_active = true
      AND membership.accepted_at IS NOT NULL
      AND company.is_active = true
      AND company.status IN ('pending_provider_setup', 'active')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users membership
    JOIN public.companies company ON company.id = membership.company_id
    WHERE membership.user_id = auth.uid()
      AND membership.company_id = p_company_id
      AND membership.role = 'company_owner'
      AND membership.is_active = true
      AND membership.accepted_at IS NOT NULL
      AND company.is_active = true
      AND company.status IN ('pending_provider_setup', 'active')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin_or_owner(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users membership
    JOIN public.companies company ON company.id = membership.company_id
    WHERE membership.user_id = auth.uid()
      AND membership.company_id = p_company_id
      AND membership.role IN ('company_owner', 'company_admin')
      AND membership.is_active = true
      AND membership.accepted_at IS NOT NULL
      AND company.is_active = true
      AND company.status IN ('pending_provider_setup', 'active')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT membership.company_id
  FROM public.company_users membership
  JOIN public.companies company ON company.id = membership.company_id
  WHERE membership.user_id = auth.uid()
    AND membership.is_active = true
    AND membership.accepted_at IS NOT NULL
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active')
  ORDER BY
    CASE membership.role
      WHEN 'company_owner' THEN 1
      WHEN 'company_admin' THEN 2
      ELSE 3
    END,
    membership.accepted_at,
    membership.id;
$$;

CREATE OR REPLACE FUNCTION public.get_primary_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT company_ids.company_id
      FROM public.get_user_company_ids() AS company_ids(company_id)
      LIMIT 1
    ),
    (
      -- Temporary legacy fallback. Only accepted legacy customer profiles
      -- with an allowed company status can use it.
      SELECT profile.company_id
      FROM public.profiles profile
      JOIN public.companies company ON company.id = profile.company_id
      WHERE profile.id = auth.uid()
        AND profile.role = 'customer'
        AND profile.is_active = true
        AND company.is_active = true
        AND company.status IN ('pending_provider_setup', 'active')
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.get_primary_company_id();
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_active_company_member(p_company_id);
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_company_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_admin_or_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_primary_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_member(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin_or_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_primary_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated;

-- Auth metadata is user-controlled during public signup. Never trust it for
-- role or company assignment; invitation acceptance performs that assignment.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, company_id, is_active)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Kullanıcı'),
    lower(NEW.email),
    'company_user',
    NULL,
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, public.profiles.email),
      full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
      updated_at = now();
  RETURN NEW;
END;
$$;

-- Suspended, rejected, and unreviewed companies cannot remain operationally
-- active even if an application route only changes status.
CREATE OR REPLACE FUNCTION public.enforce_company_status_active_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('pending_review', 'suspended', 'rejected') THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_company_status_active_state ON public.companies;
CREATE TRIGGER enforce_company_status_active_state
  BEFORE INSERT OR UPDATE OF status, is_active ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_status_active_state();

UPDATE public.companies
SET is_active = false
WHERE status IN ('pending_review', 'suspended', 'rejected')
  AND is_active = true;

-- RLS cannot restrict columns. Keep direct profile updates limited by grants.
DROP POLICY IF EXISTS profiles_customer_update ON public.profiles;
CREATE POLICY profiles_customer_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND is_active = true)
  WITH CHECK (id = auth.uid() AND is_active = true);

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- Replace company-scoped policies with accepted-membership checks.
DROP POLICY IF EXISTS profiles_company_view ON public.profiles;
CREATE POLICY profiles_company_view ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (company_id IS NOT NULL AND public.is_active_company_member(company_id))
  );

DROP POLICY IF EXISTS companies_customer_view ON public.companies;
CREATE POLICY companies_customer_view ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(id));

DROP POLICY IF EXISTS credits_customer_view ON public.sms_credits;
CREATE POLICY credits_customer_view ON public.sms_credits
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS tx_customer_view ON public.credit_transactions;
CREATE POLICY tx_customer_view ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS contacts_customer_manage ON public.contacts;
CREATE POLICY contacts_company_select ON public.contacts
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));
CREATE POLICY contacts_company_manage ON public.contacts
  FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(company_id))
  WITH CHECK (public.is_company_admin_or_owner(company_id));

DROP POLICY IF EXISTS groups_customer_manage ON public.groups;
CREATE POLICY groups_company_select ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));
CREATE POLICY groups_company_manage ON public.groups
  FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(company_id))
  WITH CHECK (public.is_company_admin_or_owner(company_id));

DROP POLICY IF EXISTS templates_customer_manage ON public.sms_templates;
CREATE POLICY templates_company_select ON public.sms_templates
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));
CREATE POLICY templates_company_manage ON public.sms_templates
  FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(company_id))
  WITH CHECK (public.is_company_admin_or_owner(company_id));

DROP POLICY IF EXISTS sms_customer_view ON public.sms_messages;
CREATE POLICY sms_company_view ON public.sms_messages
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS campaigns_customer_manage ON public.sms_campaigns;
DROP POLICY IF EXISTS campaigns_customer_view ON public.sms_campaigns;
CREATE POLICY campaigns_company_view ON public.sms_campaigns
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS api_sms_requests_customer_view ON public.api_sms_requests;
CREATE POLICY api_sms_requests_company_view ON public.api_sms_requests
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS suppression_list_customer_select ON public.suppression_list;
CREATE POLICY suppression_list_company_select ON public.suppression_list
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

DROP POLICY IF EXISTS company_users_company_select ON public.company_users;
CREATE POLICY company_users_company_select ON public.company_users
  FOR SELECT TO authenticated
  USING (public.is_active_company_member(company_id));

-- Provider settings remain admin-only. Wallet raw responses are never exposed
-- through direct customer SELECT.
DROP POLICY IF EXISTS company_provider_wallets_customer_select
  ON public.company_provider_wallets;

-- Provider dispatch/event tables contain raw provider payloads and are
-- therefore admin/service-only.
ALTER TABLE public.sms_provider_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_provider_dispatches_admin_all ON public.sms_provider_dispatches;
CREATE POLICY sms_provider_dispatches_admin_all ON public.sms_provider_dispatches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sms_delivery_events_admin_all ON public.sms_delivery_events;
CREATE POLICY sms_delivery_events_admin_all ON public.sms_delivery_events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.get_customer_provider_status()
RETURNS TABLE (
  provider_name TEXT,
  connection_status TEXT,
  sender_header TEXT,
  sender_header_status TEXT,
  has_provider BOOLEAN,
  balance NUMERIC,
  balance_unit TEXT,
  currency TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT
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
    COALESCE(setting.provider_name, wallet.provider_name, 'netgsm'),
    COALESCE(setting.connection_status, 'not_configured'),
    setting.sender_header,
    COALESCE(setting.sender_header_status, 'unknown'),
    setting.id IS NOT NULL,
    wallet.balance,
    wallet.balance_unit,
    wallet.currency,
    wallet.last_synced_at,
    COALESCE(wallet.sync_status, 'unknown')
  FROM (SELECT 1) seed
  LEFT JOIN public.company_provider_settings setting
    ON setting.company_id = v_company_id
    AND setting.provider_name = 'netgsm'
  LEFT JOIN public.company_provider_wallets wallet
    ON wallet.company_id = v_company_id
    AND wallet.provider_name = 'netgsm';
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_provider_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_provider_status() TO authenticated;

-- API key management requires an accepted owner/admin membership.
CREATE OR REPLACE FUNCTION public.create_customer_api_key(
  p_name TEXT,
  p_key_prefix TEXT,
  p_key_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_key_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  IF length(trim(p_name)) < 2 OR length(trim(p_name)) > 80 THEN RAISE EXCEPTION 'Invalid API key name'; END IF;
  IF p_key_prefix !~ '^mnx_[A-Za-z0-9_-]{6,20}$' OR p_key_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid API key format';
  END IF;

  INSERT INTO public.customer_api_keys (company_id, name, key_prefix, key_hash, created_by)
  VALUES (v_company_id, trim(p_name), p_key_prefix, p_key_hash, v_user_id)
  RETURNING id INTO v_key_id;
  RETURN v_key_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_customer_api_key(p_key_id UUID)
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
  UPDATE public.customer_api_keys api_key
  SET is_active = false, revoked_at = now()
  WHERE api_key.id = p_key_id
    AND api_key.company_id = v_company_id
    AND api_key.is_active = true;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_customer_api_keys()
RETURNS TABLE (
  id UUID, name TEXT, key_prefix TEXT, is_active BOOLEAN,
  last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
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
  SELECT api_key.id, api_key.name, api_key.key_prefix, api_key.is_active,
         api_key.last_used_at, api_key.created_at, api_key.revoked_at
  FROM public.customer_api_keys api_key
  WHERE api_key.company_id = v_company_id
  ORDER BY api_key.created_at DESC;
END;
$$;

-- Suppression list changes require company admin/owner authorization.
CREATE OR REPLACE FUNCTION public.add_suppression_entry(p_phone TEXT, p_reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_phone TEXT;
  v_id UUID;
BEGIN
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  v_phone := public.normalize_tr_phone(p_phone);
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Invalid phone number'; END IF;
  INSERT INTO public.suppression_list(company_id, phone, reason, created_by)
  VALUES (v_company_id, v_phone, NULLIF(trim(p_reason), ''), v_user_id)
  ON CONFLICT (company_id, phone)
  DO UPDATE SET reason = COALESCE(EXCLUDED.reason, public.suppression_list.reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_suppression_entries(p_phones TEXT[], p_reason TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID := public.get_primary_company_id();
  v_count INTEGER;
BEGIN
  IF v_company_id IS NULL OR NOT public.is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'Company admin or owner authorization required';
  END IF;
  WITH normalized AS (
    SELECT DISTINCT public.normalize_tr_phone(phone) AS phone
    FROM unnest(COALESCE(p_phones, ARRAY[]::TEXT[])) AS phone
  ), inserted AS (
    INSERT INTO public.suppression_list(company_id, phone, reason, created_by)
    SELECT v_company_id, phone, NULLIF(trim(p_reason), ''), v_user_id
    FROM normalized WHERE phone IS NOT NULL
    ON CONFLICT (company_id, phone)
    DO UPDATE SET reason = COALESCE(EXCLUDED.reason, public.suppression_list.reason)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_suppression_entry(p_id UUID)
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
  DELETE FROM public.suppression_list WHERE id = p_id AND company_id = v_company_id;
  RETURN FOUND;
END;
$$;

-- Queueing is an operational write and requires an accepted owner/admin
-- membership. Provider execution remains in the service-role worker.
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
  v_cost INTEGER;
  v_skipped INTEGER;
  v_recipients TEXT[];
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

  SELECT company.sender_name INTO v_sender_id
  FROM public.companies company
  WHERE company.id = v_company_id
    AND company.is_active = true
    AND company.status IN ('pending_provider_setup', 'active')
    AND company.sender_approved = true
    AND length(trim(company.sender_name)) > 0;

  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Active company and approved sender ID required'; END IF;

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

  v_segments := public.sms_segment_count(p_message);
  v_cost := cardinality(v_recipients) * v_segments;

  UPDATE public.sms_credits
  SET balance = balance - v_cost, updated_at = now()
  WHERE company_id = v_company_id AND balance >= v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

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

  INSERT INTO public.credit_transactions(company_id, amount, type, note, created_by)
  VALUES (
    v_company_id,
    -v_cost,
    'deduct',
    'Queued SMS credit reservation (' || v_cost || ' credits)',
    v_user_id
  );

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'segments', v_segments,
    'reserved_credits', v_cost,
    'skipped_recipients', v_skipped,
    'balance', (SELECT balance FROM public.sms_credits WHERE company_id = v_company_id)
  );
END;
$$;

-- Campaign cancellation uses accepted membership and cannot be used by a
-- normal company_user.
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

  SELECT campaign.company_id INTO v_company_id
  FROM public.sms_campaigns campaign
  WHERE campaign.id = p_campaign_id
    AND campaign.status = 'queued'
    AND public.is_company_admin_or_owner(campaign.company_id)
  FOR UPDATE OF campaign;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Only authorized queued campaigns can be cancelled'; END IF;

  SELECT COALESCE(sum(credits_cost), 0) INTO v_refund
  FROM public.sms_messages
  WHERE company_id = v_company_id AND campaign_id = p_campaign_id AND status = 'pending';

  UPDATE public.sms_messages
  SET status = 'failed', provider_error = 'Campaign cancelled before sending'
  WHERE company_id = v_company_id AND campaign_id = p_campaign_id AND status = 'pending';

  UPDATE public.sms_campaigns
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = p_campaign_id;

  UPDATE public.sms_credits
  SET balance = balance + v_refund, updated_at = now()
  WHERE company_id = v_company_id
  RETURNING balance INTO v_balance;

  IF v_refund > 0 THEN
    INSERT INTO public.credit_transactions(company_id, amount, type, note, created_by)
    VALUES (v_company_id, v_refund, 'refund',
      'Cancelled queued SMS refund (' || v_refund || ' credits)', v_user_id);
  END IF;

  RETURN jsonb_build_object('campaignId', p_campaign_id, 'status', 'cancelled',
    'refund', v_refund, 'balance', v_balance);
END;
$$;

-- Public registration/onboarding and client-side provider completion paths
-- are disabled. Server routes/workers keep service_role access.
REVOKE ALL ON FUNCTION public.complete_customer_onboarding(TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_customer_onboarding(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.create_sms_dispatch(TEXT, TEXT[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_sms_dispatch(UUID, JSONB) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.create_api_sms_dispatch(TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_api_sms_dispatch(TEXT, UUID, JSONB) TO service_role;
