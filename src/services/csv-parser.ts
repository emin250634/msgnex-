import Papa from "papaparse"
import type { CsvContactRow } from "@/types"

export interface CsvParseResult {
  data: CsvContactRow[]
  errors: { row: number; message: string }[]
  duplicates: { row: number; phone: string; message: string }[]
  totalRows: number
  fields: string[]
  mapping: CsvContactMapping
}

export interface CsvContactMapping {
  phone?: string
  first_name?: string
  last_name?: string
  email?: string
  consent_status?: string
  consent_source?: string
  consent_note?: string
}

function parseConsentStatus(value?: string): CsvContactRow["consent_status"] | undefined {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return undefined
  if (["izinli", "onayli", "onaylı", "evet", "yes", "true", "1", "opted_in"].includes(normalized)) return "opted_in"
  if (["izinsiz", "ret", "hayir", "hayır", "no", "false", "0", "opted_out"].includes(normalized)) return "opted_out"
  return "unknown"
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

function detectMapping(fields: string[] = []): CsvContactMapping {
  return {
    phone: fields.find((f) => /phone|telefon|gsm|cep|mobile|tel/i.test(f)),
    first_name: fields.find((f) => /first.?name|ad|isim|name|first/i.test(f)),
    last_name: fields.find((f) => /last.?name|soyad|soyisim|surname|last/i.test(f)),
    email: fields.find((f) => /email|e-posta|mail|eposta/i.test(f)),
    consent_status: fields.find((f) => /consent|izin|kvkk|onay|permission/i.test(f)),
    consent_source: fields.find((f) => /consent_source|izin_kaynagi|izin_kaynağı|kaynak|source/i.test(f)),
    consent_note: fields.find((f) => /consent_note|izin_notu|not|note/i.test(f)),
  }
}

export function parseContactCsv(content: string, mappingOverride: CsvContactMapping = {}): CsvParseResult {
  const result = (Papa as any).parse(content, {
    header: true,
    skipEmptyLines: true,
    encoding: "utf-8",
  }) as Papa.ParseResult<Record<string, string>>

  const errors: { row: number; message: string }[] = []
  const duplicates: { row: number; phone: string; message: string }[] = []
  const data: CsvContactRow[] = []
  const seenPhones = new Set<string>()
  const fields = result.meta.fields ?? []
  const detectedMapping = detectMapping(fields)
  const mapping = { ...detectedMapping, ...mappingOverride }

  const phoneKey = mapping.phone
  const firstNameKey = mapping.first_name
  const lastNameKey = mapping.last_name
  const emailKey = mapping.email
  const consentStatusKey = mapping.consent_status
  const consentSourceKey = mapping.consent_source
  const consentNoteKey = mapping.consent_note

  if (!phoneKey) {
    errors.push({ row: 0, message: "CSV'de telefon sütunu bulunamadı" })
    return { data: [], errors, duplicates, totalRows: result.data.length, fields, mapping }
  }

  result.data.forEach((row, idx) => {
    const phone = (row[phoneKey] || "").trim()
    const normalizedPhone = normalizePhone(phone)
    if (!phone) {
      errors.push({ row: idx + 1, message: `Satır ${idx + 1}: Telefon numarası boş` })
      return
    }
    if (!/^\d{10,15}$/.test(normalizedPhone)) {
      errors.push({ row: idx + 1, message: `Satır ${idx + 1}: Telefon numarası geçersiz` })
      return
    }
    if (seenPhones.has(normalizedPhone)) {
      duplicates.push({ row: idx + 1, phone: normalizedPhone, message: `Satır ${idx + 1}: CSV içinde tekrar eden telefon` })
      return
    }
    seenPhones.add(normalizedPhone)

    data.push({
      first_name: firstNameKey ? (row[firstNameKey] || "").trim() : "",
      last_name: lastNameKey ? (row[lastNameKey] || "").trim() : undefined,
      phone: normalizedPhone,
      email: emailKey ? (row[emailKey] || "").trim() : undefined,
      consent_status: consentStatusKey ? parseConsentStatus(row[consentStatusKey]) : undefined,
      consent_source: consentSourceKey ? (row[consentSourceKey] || "").trim() : undefined,
      consent_note: consentNoteKey ? (row[consentNoteKey] || "").trim() : undefined,
    })
  })

  return { data, errors, duplicates, totalRows: result.data.length, fields, mapping }
}
