import Papa from "papaparse"

export interface SuppressionCsvParseResult {
  phones: string[]
  errors: string[]
}

export function parseSuppressionCsv(content: string): SuppressionCsvParseResult {
  const result = (Papa as any).parse(content, {
    header: true,
    skipEmptyLines: true,
    encoding: "utf-8",
  }) as Papa.ParseResult<Record<string, string>>

  const phoneKey = result.meta.fields?.find((field) =>
    /phone|telefon|gsm|cep|mobile|tel/i.test(field)
  )

  if (!phoneKey) {
    return { phones: [], errors: ["CSV dosyasında telefon sütunu bulunamadı."] }
  }

  const phones = result.data
    .map((row) => (row[phoneKey] || "").trim())
    .filter(Boolean)

  if (phones.length === 0) {
    return { phones: [], errors: ["CSV dosyasında telefon numarası bulunamadı."] }
  }

  return { phones, errors: [] }
}
