export type Role = "admin" | "company_owner" | "company_admin" | "company_user" | "customer"

export interface Profile {
  id: string
  full_name: string
  email: string | null
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
  status: "pending_review" | "pending_provider_setup" | "active" | "suspended" | "rejected"
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
  consent_status: "unknown" | "opted_in" | "opted_out"
  consent_source: string | null
  consent_recorded_at: string | null
  consent_note: string | null
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
  provider_name: string | null
  provider_bulk_id: string | null
  provider_message_id: string | null
  provider_status_code: string | null
  provider_status_text: string | null
  provider_error: string | null
  provider_raw_status: unknown | null
  accepted_at: string | null
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  last_dlr_checked_at: string | null
  dlr_attempt_count: number
  is_final: boolean
  refunded_at: string | null
  refund_transaction_id: string | null
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
  provider_name: string | null
  provider_bulk_id: string | null
  provider_status: string | null
  provider_status_code: string | null
  provider_status_text: string | null
  provider_raw_response: unknown | null
  provider_submitted_at: string | null
  provider_completed_at: string | null
  dlr_last_checked_at: string | null
  dlr_completed_at: string | null
  dlr_check_count: number
  provider_success_count: number
  provider_failed_count: number
  provider_pending_count: number
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

export interface ContactConsentEvent {
  id: string
  company_id: string
  contact_id: string | null
  phone: string
  previous_status: "unknown" | "opted_in" | "opted_out" | null
  next_status: "unknown" | "opted_in" | "opted_out"
  source: string | null
  note: string | null
  recorded_by: string | null
  recorded_at: string
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
  consent_status?: "unknown" | "opted_in" | "opted_out"
  consent_source?: string
  consent_note?: string
}

export interface CompanyUser {
  id: string
  company_id: string
  user_id: string
  role: "company_owner" | "company_admin" | "company_user"
  is_active: boolean
  invited_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface CompanyInvitation {
  id: string
  company_id: string
  user_id: string | null
  email: string
  full_name: string | null
  role: "company_owner" | "company_admin" | "company_user"
  status: "pending" | "accepted" | "revoked" | "failed"
  invited_by: string | null
  invited_at: string
  accepted_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface DemoRequest {
  id: string
  full_name: string
  company_name: string
  phone: string
  email: string
  monthly_sms_volume: string
  message: string | null
  status: "new" | "contacted" | "approved" | "rejected"
  approved_at: string | null
  rejected_at: string | null
  company_id: string | null
  invitation_id: string | null
  rejection_reason: string | null
  last_email_sent_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}
