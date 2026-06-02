export type Role = "admin" | "customer"

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: Role
  company_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  name: string
  tax_no: string | null
  phone: string | null
  address: string | null
  is_active: boolean
  sender_name: string
  sender_approved: boolean
  created_at: string
  updated_at: string
}

export interface SmsCredit {
  id: string
  company_id: string
  balance: number
  created_at: string
  updated_at: string
}

export interface ProviderWallet {
  id: string
  provider_name: string
  currency: string
  balance: number
  created_at: string
  updated_at: string
}

export interface CustomerApiKey {
  id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

export interface CreditTransaction {
  id: string
  company_id: string
  amount: number
  type: "add" | "deduct" | "purchase" | "refund"
  note: string | null
  created_by: string | null
  created_at: string
}

export interface Contact {
  id: string
  company_id: string
  first_name: string
  last_name: string | null
  phone: string
  email: string | null
  group_id: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  company_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface SmsMessage {
  id: string
  company_id: string
  campaign_id: string | null
  sender_id: string
  recipient: string
  message: string
  status: "pending" | "sent" | "delivered" | "failed"
  credits_cost: number
  sent_at: string | null
  created_at: string
}

export interface SmsCampaign {
  id: string
  company_id: string
  name: string
  message: string
  group_id: string | null
  total_recipients: number
  skipped_recipients: number
  success_count: number
  fail_count: number
  status: "draft" | "queued" | "scheduled" | "sending" | "completed" | "failed" | "cancelled" | "review_required"
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface SuppressionEntry {
  id: string
  company_id: string
  phone: string
  reason: string | null
  created_at: string
}

export interface SmsTemplate {
  id: string
  company_id: string
  name: string
  message: string
  created_at: string
  updated_at: string
}

export interface CsvContactRow {
  first_name: string
  last_name?: string
  phone: string
  email?: string
}
