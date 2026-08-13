-- Persistent server-side rate limit buckets for public/API guardrails.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limit_buckets_no_client_access ON public.rate_limit_buckets;
CREATE POLICY rate_limit_buckets_no_client_access
  ON public.rate_limit_buckets
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.rate_limit_check(
  p_key TEXT,
  p_limit INTEGER,
  p_window_ms INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  limit_value INTEGER,
  remaining INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_count INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 OR length(trim(p_key)) > 240 THEN
    RAISE EXCEPTION 'Invalid rate limit key';
  END IF;
  IF p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid rate limit';
  END IF;
  IF p_window_ms < 1000 OR p_window_ms > 86400000 THEN
    RAISE EXCEPTION 'Invalid rate limit window';
  END IF;

  INSERT INTO public.rate_limit_buckets(key, count, reset_at, updated_at)
  VALUES (trim(p_key), 1, v_now + make_interval(secs => p_window_ms / 1000.0), v_now)
  ON CONFLICT (key) DO UPDATE
  SET count = CASE
        WHEN public.rate_limit_buckets.reset_at <= v_now THEN 1
        ELSE public.rate_limit_buckets.count + 1
      END,
      reset_at = CASE
        WHEN public.rate_limit_buckets.reset_at <= v_now THEN v_now + make_interval(secs => p_window_ms / 1000.0)
        ELSE public.rate_limit_buckets.reset_at
      END,
      updated_at = v_now
  RETURNING rate_limit_buckets.count, rate_limit_buckets.reset_at
  INTO v_count, v_reset_at;

  RETURN QUERY SELECT
    v_count <= p_limit,
    p_limit,
    greatest(p_limit - v_count, 0),
    CASE
      WHEN v_count <= p_limit THEN 0
      ELSE greatest(ceil(extract(epoch FROM (v_reset_at - v_now)))::INTEGER, 1)
    END;
END;
$$;

REVOKE ALL ON public.rate_limit_buckets FROM anon;
REVOKE ALL ON public.rate_limit_buckets FROM authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_check(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_check(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.rate_limit_check(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_check(TEXT, INTEGER, INTEGER) TO service_role;
