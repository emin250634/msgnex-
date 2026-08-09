import { createClient } from "@/lib/supabase/client"
import type { Contact, CsvContactRow } from "@/types"

interface ImportResult {
  imported: number
  errors: { row: number; message: string }[]
}

type ConsentStatus = NonNullable<CsvContactRow["consent_status"]>

interface ConsentEventInput {
  companyId: string
  contactId?: string | null
  phone: string
  previousStatus?: ConsentStatus | null
  nextStatus: ConsentStatus
  source?: string | null
  note?: string | null
}

export async function recordContactConsentEvent({
  companyId,
  contactId = null,
  phone,
  previousStatus = null,
  nextStatus,
  source = null,
  note = null,
}: ConsentEventInput) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from("contact_consent_events").insert({
    company_id: companyId,
    contact_id: contactId,
    phone,
    previous_status: previousStatus,
    next_status: nextStatus,
    source,
    note,
    recorded_by: user?.id ?? null,
  })
}

export async function importContactsFromCsv(
  contacts: CsvContactRow[],
  groupId?: string,
  defaultConsentStatus: CsvContactRow["consent_status"] = "unknown"
): Promise<ImportResult> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Kullanıcı girişi gerekli")

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) throw new Error("Firma bulunamadı")

  const rows = contacts.map((c) => {
    const consentStatus = c.consent_status || defaultConsentStatus

    return {
      company_id: profile.company_id,
      first_name: c.first_name,
      last_name: c.last_name || null,
      phone: c.phone,
      email: c.email || null,
      group_id: groupId || null,
      consent_status: consentStatus,
      consent_source: consentStatus !== "unknown" ? c.consent_source || "csv_import" : null,
      consent_recorded_at: consentStatus !== "unknown" ? new Date().toISOString() : null,
      consent_note: c.consent_note || null,
    }
  })

  const { data: insertedRows, error } = await supabase
    .from("contacts")
    .insert(rows)
    .select("id, company_id, phone, consent_status, consent_source, consent_note")

  if (error) throw error

  const consentEvents = (insertedRows ?? [])
    .filter((row: Pick<Contact, "consent_status">) => row.consent_status !== "unknown")
    .map((row: Pick<Contact, "id" | "company_id" | "phone" | "consent_status" | "consent_source" | "consent_note">) => ({
      company_id: row.company_id,
      contact_id: row.id,
      phone: row.phone,
      previous_status: null,
      next_status: row.consent_status,
      source: row.consent_source || "csv_import",
      note: row.consent_note,
      recorded_by: user.id,
    }))

  if (consentEvents.length > 0) {
    await supabase.from("contact_consent_events").insert(consentEvents)
  }

  return {
    imported: rows.length,
    errors: [],
  }
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("contacts").delete().eq("id", id)
  if (error) throw error
}
