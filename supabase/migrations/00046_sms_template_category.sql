-- Optional category for organizing SMS templates by operational use case.

ALTER TABLE public.sms_templates
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

ALTER TABLE public.sms_templates
  DROP CONSTRAINT IF EXISTS sms_templates_category_check;

ALTER TABLE public.sms_templates
  ADD CONSTRAINT sms_templates_category_check
  CHECK (category IN ('general', 'campaign', 'announcement', 'appointment', 'payment', 'support'));

CREATE INDEX IF NOT EXISTS idx_sms_templates_company_category
  ON public.sms_templates(company_id, category);

COMMENT ON COLUMN public.sms_templates.category IS
  'Template category used to organize reusable SMS content.';
