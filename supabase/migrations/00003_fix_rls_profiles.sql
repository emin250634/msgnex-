-- Fix: Allow customers to update their own profile (for company_id assignment on registration)
CREATE POLICY profiles_customer_update ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Fix: Self-service SELECT policy (avoids recursion from company_id IN (...))
DROP POLICY IF EXISTS profiles_customer_view ON public.profiles;
CREATE POLICY profiles_customer_view ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
