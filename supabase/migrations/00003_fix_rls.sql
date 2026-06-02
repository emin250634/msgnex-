-- Security definer helpers (bypass RLS, no recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Profiles
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_customer_view ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY profiles_self ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_customer_update ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_company_view ON public.profiles FOR SELECT USING (company_id = public.my_company_id());

-- Companies
DROP POLICY IF EXISTS companies_admin_all ON public.companies;
DROP POLICY IF EXISTS companies_customer_view ON public.companies;
CREATE POLICY companies_admin_all ON public.companies FOR ALL USING (public.is_admin());
CREATE POLICY companies_customer_view ON public.companies FOR SELECT USING (id = public.my_company_id());

-- SMS Credits
DROP POLICY IF EXISTS credits_admin_all ON public.sms_credits;
DROP POLICY IF EXISTS credits_customer_view ON public.sms_credits;
CREATE POLICY credits_admin_all ON public.sms_credits FOR ALL USING (public.is_admin());
CREATE POLICY credits_customer_view ON public.sms_credits FOR SELECT USING (company_id = public.my_company_id());

-- Credit Transactions
DROP POLICY IF EXISTS tx_admin_all ON public.credit_transactions;
DROP POLICY IF EXISTS tx_customer_view ON public.credit_transactions;
CREATE POLICY tx_admin_all ON public.credit_transactions FOR ALL USING (public.is_admin());
CREATE POLICY tx_customer_view ON public.credit_transactions FOR SELECT USING (company_id = public.my_company_id());

-- Contacts
DROP POLICY IF EXISTS contacts_admin_all ON public.contacts;
DROP POLICY IF EXISTS contacts_customer_manage ON public.contacts;
CREATE POLICY contacts_admin_all ON public.contacts FOR ALL USING (public.is_admin());
CREATE POLICY contacts_customer_manage ON public.contacts FOR ALL USING (company_id = public.my_company_id());

-- Groups
DROP POLICY IF EXISTS groups_admin_all ON public.groups;
DROP POLICY IF EXISTS groups_customer_manage ON public.groups;
CREATE POLICY groups_admin_all ON public.groups FOR ALL USING (public.is_admin());
CREATE POLICY groups_customer_manage ON public.groups FOR ALL USING (company_id = public.my_company_id());

-- SMS Messages
DROP POLICY IF EXISTS sms_admin_all ON public.sms_messages;
DROP POLICY IF EXISTS sms_customer_view ON public.sms_messages;
CREATE POLICY sms_admin_all ON public.sms_messages FOR ALL USING (public.is_admin());
CREATE POLICY sms_customer_view ON public.sms_messages FOR SELECT USING (company_id = public.my_company_id());

-- SMS Campaigns
DROP POLICY IF EXISTS campaigns_admin_all ON public.sms_campaigns;
DROP POLICY IF EXISTS campaigns_customer_manage ON public.sms_campaigns;
CREATE POLICY campaigns_admin_all ON public.sms_campaigns FOR ALL USING (public.is_admin());
CREATE POLICY campaigns_customer_manage ON public.sms_campaigns FOR ALL USING (company_id = public.my_company_id());

-- SMS Templates
DROP POLICY IF EXISTS templates_admin_all ON public.sms_templates;
DROP POLICY IF EXISTS templates_customer_manage ON public.sms_templates;
CREATE POLICY templates_admin_all ON public.sms_templates FOR ALL USING (public.is_admin());
CREATE POLICY templates_customer_manage ON public.sms_templates FOR ALL USING (company_id = public.my_company_id());
