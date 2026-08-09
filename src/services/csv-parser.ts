import Papa from "papaparse"
import type { CsvContactRow } from "@/types"

export interface CsvParseResult {
  data: CsvContactRow[]
  errors: { row: number; message: string }[]
  totalRows: number
}

function parseConsentStatus(value?: string): CsvContactRow["consent_status"] | undefined {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return undefined
  if (["izinli", "onayli", "onaylı", "evet", "yes", "true", "1", "opted_in"].includes(normalized)) return "opted_in"
  if (["izinsiz", "ret", "hayir", "hayır", "no", "false", "0", "opted_out"].includes(normalized)) return "opted_out"
  return "unknown"
}

export function parseContactCsv(content: string): CsvParseResult {
  const result = (Papa as any).parse(content, {
    header: true,
    skipEmptyLines: true,
    encoding: "utf-8",
  }) as Papa.ParseResult<Record<string, string>>

  const errors: { row: number; message: string }[] = []
  const data: CsvContactRow[] = []

  const phoneKey = result.meta.fields?.find((f) =>
    /phone|telefon|gsm|cep|mobile|tel/i.test(f)
  )
  const firstNameKey = result.meta.fields?.find((f) =>
    /first.?name|ad|isim|name|first/i.test(f)
  )
  const lastNameKey = result.meta.fields?.find((f) =>
    /last.?name|soyad|soyisim|surname|last/i.test(f)
  )
  const emailKey = result.meta.fields?.find((f) =>
    /email|e-posta|mail|eposta/i.test(f)
  )
  const consentStatusKey = result.meta.fields?.find((f) =>
    /consent|izin|kvkk|onay|permission/i.test(f)
  )
  const consentSourceKey = result.meta.fields?.find((f) =>
    /consent_source|izin_kaynagi|izin_kaynağı|kaynak|source/i.test(f)
  )
  const consentNoteKey = result.meta.fields?.find((f) =>
    /consent_note|izin_notu|not|note/i.test(f)
  )

  if (!phoneKey) {
    errors.push({ row: 0, message: "CSV'de telefon sütunu bulunamadı" })
    return { data: [], errors, totalRows: result.data.length }
  }

  result.data.forEach((row, idx) => {
    const phone = (row[phoneKey] || "").trim()
    if (!phone) {
      errors.push({ row: idx + 1, message: `Satır ${idx + 1}: Telefon numarası boş` })
      return
    }

    data.push({
      first_name: firstNameKey ? (row[firstNameKey] || "").trim() : "",
      last_name: lastNameKey ? (row[lastNameKey] || "").trim() : undefined,
      phone: phone.replace(/[\s\-\+\(\)]/g, ""),
      email: emailKey ? (row[emailKey] || "").trim() : undefined,
      consent_status: consentStatusKey ? parseConsentStatus(row[consentStatusKey]) : undefined,
      consent_source: consentSourceKey ? (row[consentSourceKey] || "").trim() : undefined,
      consent_note: consentNoteKey ? (row[consentNoteKey] || "").trim() : undefined,
    })
  })

  return { data, errors, totalRows: result.data.length }
}
