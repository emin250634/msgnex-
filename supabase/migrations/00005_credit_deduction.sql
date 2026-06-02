-- Kredi düşme işlemi için SECURITY DEFINER fonksiyon
-- Müşteri doğrudan UPDATE yapamaz, bu fonksiyon üzerinden güvenli düşüş yapar

CREATE OR REPLACE FUNCTION public.deduct_sms_credits(p_company_id uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT balance INTO current_balance FROM public.sms_credits WHERE company_id = p_company_id FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_amount THEN
    RETURN false;
  END IF;

  UPDATE public.sms_credits SET balance = balance - p_amount WHERE company_id = p_company_id;
  RETURN true;
END;
$$;

-- Eski policy'leri temizle
DROP POLICY IF EXISTS credits_admin_all ON public.sms_credits;
DROP POLICY IF EXISTS credits_customer_view ON public.sms_credits;

-- Admin her şeyi yapabilir
CREATE POLICY credits_admin_all ON public.sms_credits
  FOR ALL USING (public.is_admin());

-- Müşteri sadece kendi firmasının kredisini görebilir (UPDATE yok, fonksiyon kullanılır)
CREATE POLICY credits_customer_select ON public.sms_credits
  FOR SELECT USING (company_id = public.my_company_id());
