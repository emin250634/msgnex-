-- ============================================================
-- MSGNEX - Netgsm provider schema foundation
-- Phase 1: only new provider columns and new provider tables.
-- No RPC changes.
-- No status constraint changes.
-- No indexes except implicit primary key / unique constraints.
-- No RLS policy changes.
-- ============================================================

-- 1. Campaign-level provider metadata.

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_bulk_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_status_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_status_text TEXT,
  ADD COLUMN IF NOT EXISTS provider_raw_response JSONB,
  ADD COLUMN IF NOT EXISTS provider_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dlr_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dlr_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dlr_check_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_success_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_failed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_pending_count INTEGER NOT NULL DEFAULT 0;

-- 2. Message-level provider metadata.

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_bulk_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_status_text TEXT,
  ADD COLUMN IF NOT EXISTS provider_raw_status JSONB,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_dlr_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dlr_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE SET NULL;

-- 3. Provider dispatch audit table.
-- Stores one provider submit attempt per campaign/provider request.

CREATE TABLE IF NOT EXISTS public.sms_provider_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_bulk_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT NOT NULL CHECK (status IN (
    'created',
    'submitted',
    'accepted',
    'rejected',
    'awaiting_dlr',
    'completed',
    'failed',
    'review_required'
  )),
  provider_status_code TEXT,
  provider_status_text TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Delivery report event audit table.
-- Stores provider DLR/webhook/polling events as append-only history.

CREATE TABLE IF NOT EXISTS public.sms_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_message_id UUID REFERENCES public.sms_messages(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_bulk_id TEXT,
  provider_message_id TEXT,
  provider_status_code TEXT,
  provider_status_text TEXT,
  normalized_status TEXT NOT NULL,
  raw_payload JSONB,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
