-- Add SMS sender name per company
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sender_approved BOOLEAN NOT NULL DEFAULT false;
