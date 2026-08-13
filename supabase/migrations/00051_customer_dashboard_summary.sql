-- ============================================================
-- MSGNEX - Customer dashboard summary RPC
-- Consolidates dashboard counts and recent rows into one DB call.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_customer_dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID := public.get_primary_company_id();
  v_last30_start TIMESTAMPTZ := now() - interval '30 days';
  v_company JSONB;
  v_provider JSONB;
  v_contacts JSONB;
  v_segments JSONB;
  v_campaigns JSONB;
  v_messages JSONB;
  v_recent_messages JSONB;
  v_recent_failed_messages JSONB;
  v_recent_campaigns JSONB;
BEGIN
  IF v_company_id IS NULL OR NOT public.is_active_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Active accepted company membership required';
  END IF;

  SELECT jsonb_build_object(
    'id', company.id,
    'name', COALESCE(company.name, '-'),
    'plan', COALESCE(company.plan, 'starter')
  )
  INTO v_company
  FROM public.companies company
  WHERE company.id = v_company_id;

  SELECT jsonb_build_object(
    'provider_name', COALESCE(setting.provider_name, wallet.provider_name, 'netgsm'),
    'connection_status', COALESCE(setting.connection_status, 'not_configured'),
    'sender_header', setting.sender_header,
    'sender_header_status', COALESCE(setting.sender_header_status, 'unknown'),
    'has_provider', setting.id IS NOT NULL,
    'balance', wallet.balance,
    'balance_unit', COALESCE(wallet.balance_unit, 'sms'),
    'currency', wallet.currency,
    'last_synced_at', wallet.last_synced_at,
    'sync_status', COALESCE(wallet.sync_status, 'unknown')
  )
  INTO v_provider
  FROM (SELECT 1) seed
  LEFT JOIN public.company_provider_settings setting
    ON setting.company_id = v_company_id
    AND setting.provider_name = 'netgsm'
  LEFT JOIN public.company_provider_wallets wallet
    ON wallet.company_id = v_company_id
    AND wallet.provider_name = 'netgsm';

  v_contacts := jsonb_set(
    COALESCE((
      SELECT jsonb_build_object(
        'total', count(*),
        'opted_in', count(*) FILTER (WHERE contact.consent_status = 'opted_in'),
        'opted_out', count(*) FILTER (WHERE contact.consent_status = 'opted_out'),
        'unknown_consent', count(*) FILTER (WHERE contact.consent_status = 'unknown'),
        'email_customers', count(*) FILTER (WHERE NULLIF(btrim(COALESCE(contact.email, '')), '') IS NOT NULL)
      )
      FROM public.contacts contact
      WHERE contact.company_id = v_company_id
    ), '{}'::jsonb),
    '{suppression}',
    to_jsonb(COALESCE((
      SELECT count(*)
      FROM public.suppression_list suppression
      WHERE suppression.company_id = v_company_id
    ), 0)),
    true
  );

  WITH company_groups AS (
    SELECT crm_group.id, crm_group.name
    FROM public.groups crm_group
    WHERE crm_group.company_id = v_company_id
  ),
  vip_groups AS (
    SELECT id
    FROM company_groups
    WHERE lower(COALESCE(name, '')) LIKE '%vip%'
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM company_groups),
    'vip_customers', (
      SELECT count(*)
      FROM public.contacts contact
      WHERE contact.company_id = v_company_id
        AND contact.group_id IN (SELECT id FROM vip_groups)
    )
  )
  INTO v_segments;

  SELECT jsonb_build_object(
    'total', count(*),
    'last30', count(*) FILTER (WHERE campaign.created_at >= v_last30_start),
    'awaiting_dlr', count(*) FILTER (WHERE campaign.provider_status = 'awaiting_dlr'),
    'provider_failed', count(*) FILTER (WHERE campaign.provider_status = 'failed'),
    'review_required', count(*) FILTER (WHERE campaign.status = 'review_required')
  )
  INTO v_campaigns
  FROM public.sms_campaigns campaign
  WHERE campaign.company_id = v_company_id;

  SELECT jsonb_build_object(
    'last30', count(*),
    'sent_last30', count(*) FILTER (WHERE message.status = 'sent'),
    'delivered_last30', count(*) FILTER (WHERE message.status = 'delivered'),
    'failed_last30', count(*) FILTER (WHERE message.status = 'failed'),
    'pending_last30', count(*) FILTER (WHERE message.status = 'pending')
  )
  INTO v_messages
  FROM public.sms_messages message
  WHERE message.company_id = v_company_id
    AND message.created_at >= v_last30_start;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
  INTO v_recent_messages
  FROM (
    SELECT *
    FROM public.sms_messages message
    WHERE message.company_id = v_company_id
    ORDER BY message.created_at DESC
    LIMIT 6
  ) row_data;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
  INTO v_recent_failed_messages
  FROM (
    SELECT *
    FROM public.sms_messages message
    WHERE message.company_id = v_company_id
      AND message.status = 'failed'
    ORDER BY message.created_at DESC
    LIMIT 4
  ) row_data;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
  INTO v_recent_campaigns
  FROM (
    SELECT *
    FROM public.sms_campaigns campaign
    WHERE campaign.company_id = v_company_id
    ORDER BY campaign.created_at DESC
    LIMIT 5
  ) row_data;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, '{}'::jsonb),
    'provider', COALESCE(v_provider, '{}'::jsonb),
    'contacts', COALESCE(v_contacts, '{}'::jsonb),
    'segments', COALESCE(v_segments, '{}'::jsonb),
    'campaigns', COALESCE(v_campaigns, '{}'::jsonb),
    'messages', COALESCE(v_messages, '{}'::jsonb),
    'recent_messages', COALESCE(v_recent_messages, '[]'::jsonb),
    'recent_failed_messages', COALESCE(v_recent_failed_messages, '[]'::jsonb),
    'recent_campaigns', COALESCE(v_recent_campaigns, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_dashboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_dashboard_summary() TO authenticated;
