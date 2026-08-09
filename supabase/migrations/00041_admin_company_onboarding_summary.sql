-- Admin onboarding summary for pilot/customer activation tracking.

CREATE OR REPLACE FUNCTION public.list_admin_company_onboarding(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
  company_id UUID,
  provider_ready BOOLEAN,
  sender_header_ready BOOLEAN,
  contact_count INTEGER,
  group_count INTEGER,
  template_count INTEGER,
  campaign_count INTEGER,
  active_api_key_count INTEGER,
  active_webhook_count INTEGER,
  completed_required_steps INTEGER,
  total_required_steps INTEGER,
  progress INTEGER,
  status TEXT,
  next_step TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      company.id,
      COALESCE(setting.is_active, false)
        AND COALESCE(setting.connection_status, 'not_configured') <> 'disabled'
        AND COALESCE(setting.sender_header, '') <> '' AS provider_ready,
      COALESCE(setting.sender_header, '') <> '' AS sender_header_ready,
      COALESCE(contact_counts.count, 0)::INTEGER AS contact_count,
      COALESCE(group_counts.count, 0)::INTEGER AS group_count,
      COALESCE(template_counts.count, 0)::INTEGER AS template_count,
      COALESCE(campaign_counts.count, 0)::INTEGER AS campaign_count,
      COALESCE(api_key_counts.count, 0)::INTEGER AS active_api_key_count,
      COALESCE(webhook_counts.count, 0)::INTEGER AS active_webhook_count
    FROM public.companies company
    LEFT JOIN public.company_provider_settings setting
      ON setting.company_id = company.id
      AND setting.provider_name = 'netgsm'
    LEFT JOIN LATERAL (
      SELECT count(*) FROM public.contacts contact WHERE contact.company_id = company.id
    ) contact_counts ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FROM public.groups crm_group WHERE crm_group.company_id = company.id
    ) group_counts ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FROM public.sms_templates template WHERE template.company_id = company.id
    ) template_counts ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FROM public.sms_campaigns campaign WHERE campaign.company_id = company.id
    ) campaign_counts ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FROM public.customer_api_keys api_key
      WHERE api_key.company_id = company.id AND api_key.is_active = true
    ) api_key_counts ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FROM public.company_webhooks webhook
      WHERE webhook.company_id = company.id AND webhook.is_active = true
    ) webhook_counts ON true
    WHERE p_company_id IS NULL OR company.id = p_company_id
  ), scored AS (
    SELECT
      base.*,
      (
        CASE WHEN provider_ready THEN 1 ELSE 0 END +
        CASE WHEN sender_header_ready THEN 1 ELSE 0 END +
        CASE WHEN contact_count > 0 THEN 1 ELSE 0 END +
        CASE WHEN group_count > 0 THEN 1 ELSE 0 END +
        CASE WHEN campaign_count > 0 THEN 1 ELSE 0 END
      )::INTEGER AS completed_required_steps,
      5::INTEGER AS total_required_steps
    FROM base
  )
  SELECT
    scored.id,
    scored.provider_ready,
    scored.sender_header_ready,
    scored.contact_count,
    scored.group_count,
    scored.template_count,
    scored.campaign_count,
    scored.active_api_key_count,
    scored.active_webhook_count,
    scored.completed_required_steps,
    scored.total_required_steps,
    round((scored.completed_required_steps::NUMERIC / scored.total_required_steps::NUMERIC) * 100)::INTEGER AS progress,
    CASE
      WHEN scored.completed_required_steps = scored.total_required_steps THEN 'pilot_ready'
      WHEN scored.provider_ready = false THEN 'provider_blocked'
      WHEN scored.contact_count = 0 THEN 'data_needed'
      WHEN scored.campaign_count = 0 THEN 'test_campaign_needed'
      ELSE 'in_progress'
    END AS status,
    CASE
      WHEN scored.provider_ready = false THEN 'Provider bağlantısı tamamlanmalı'
      WHEN scored.sender_header_ready = false THEN 'Onaylı SMS başlığı doğrulanmalı'
      WHEN scored.contact_count = 0 THEN 'İlk kişi listesi eklenmeli'
      WHEN scored.group_count = 0 THEN 'Test segmenti oluşturulmalı'
      WHEN scored.campaign_count = 0 THEN 'İlk test kampanyası gönderilmeli'
      ELSE 'Pilot kurulum hazır'
    END AS next_step
  FROM scored
  ORDER BY progress ASC, contact_count ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_company_onboarding(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_company_onboarding(UUID) TO authenticated;
