import Papa from "papaparse"
import type { CsvContactRow } from "@/types"

export interface CsvParseResult {
  data: CsvContactRow[]
  errors: { row: number; message: string }[]
  totalRows: number
}

export function parseContactCsv(content: string): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    encoding: "utf-8",
  })

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
    })
  })

  return { data, errors, totalRows: result.data.length }
}
