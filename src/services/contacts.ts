import { createClient } from "@/lib/supabase/client"
import type { Contact, CsvContactRow } from "@/types"

interface ImportResult {
  imported: number
  errors: { row: number; message: string }[]
}

export async function importContactsFromCsv(
  contacts: CsvContactRow[],
  groupId?: string
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

  const rows = contacts.map((c) => ({
    company_id: profile.company_id,
    first_name: c.first_name,
    last_name: c.last_name || null,
    phone: c.phone,
    email: c.email || null,
    group_id: groupId || null,
  }))

  const { error } = await supabase.from("contacts").insert(rows)

  if (error) throw error

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
