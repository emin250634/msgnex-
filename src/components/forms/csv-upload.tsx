"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { parseContactCsv } from "@/services/csv-parser"
import type { CsvContactMapping, CsvParseResult } from "@/services/csv-parser"
import { importContactsFromCsv } from "@/services/contacts"
import type { CsvContactRow } from "@/types"

interface CsvUploadProps {
  groupId?: string
  defaultConsentStatus?: CsvContactRow["consent_status"]
  remainingLimit?: number
  onComplete: (imported: number, errors: { row: number; message: string }[]) => void
}

function consentLabel(value?: CsvContactRow["consent_status"]) {
  if (value === "opted_in") return "İzinli"
  if (value === "opted_out") return "İzinsiz"
  return "Bilinmiyor"
}

export function CsvUpload({ groupId, defaultConsentStatus = "unknown", remainingLimit, onComplete }: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null)
  const [csvContent, setCsvContent] = useState("")
  const [mapping, setMapping] = useState<CsvContactMapping>({})

  const preview = parseResult?.data.slice(0, 5) ?? []
  const exceedsLimit = typeof remainingLimit === "number" && Boolean(parseResult?.data.length && parseResult.data.length > remainingLimit)
  const consentCounts = (parseResult?.data ?? []).reduce(
    (acc, row) => {
      const status = row.consent_status || defaultConsentStatus || "unknown"
      acc[status] += 1
      return acc
    },
    { opted_in: 0, opted_out: 0, unknown: 0 }
  )

  const reset = () => {
    setParseResult(null)
    setCsvContent("")
    setMapping({})
    if (inputRef.current) inputRef.current.value = ""
  }

  const updateMapping = (key: keyof CsvContactMapping, value: string) => {
    if (!csvContent) return
    const nextMapping = { ...mapping, [key]: value || undefined }
    setMapping(nextMapping)
    setParseResult(parseContactCsv(csvContent, nextMapping))
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const result = parseContactCsv(text)
    setCsvContent(text)
    setMapping(result.mapping)

    if (result.errors.length > 0 && result.data.length === 0) {
      setParseResult(result)
      return
    }

    setParseResult(result)
  }

  const handleImport = async () => {
    if (!parseResult || parseResult.data.length === 0) return
    setLoading(true)

    try {
      const res = await importContactsFromCsv(parseResult.data, groupId, defaultConsentStatus)
      onComplete(res.imported, parseResult.errors)
      reset()
    } catch (err) {
      onComplete(0, [{ row: 0, message: (err as Error).message }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
        disabled={loading}
      />
      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {parseResult && (
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-950">Kolon Eşleştirme</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MappingSelect label="Telefon *" value={mapping.phone || ""} fields={parseResult.fields} onChange={(value) => updateMapping("phone", value)} />
              <MappingSelect label="Ad" value={mapping.first_name || ""} fields={parseResult.fields} onChange={(value) => updateMapping("first_name", value)} />
              <MappingSelect label="Soyad" value={mapping.last_name || ""} fields={parseResult.fields} onChange={(value) => updateMapping("last_name", value)} />
              <MappingSelect label="E-posta" value={mapping.email || ""} fields={parseResult.fields} onChange={(value) => updateMapping("email", value)} />
              <MappingSelect label="İzin Durumu" value={mapping.consent_status || ""} fields={parseResult.fields} onChange={(value) => updateMapping("consent_status", value)} />
              <MappingSelect label="İzin Kaynağı" value={mapping.consent_source || ""} fields={parseResult.fields} onChange={(value) => updateMapping("consent_source", value)} />
              <MappingSelect label="İzin Notu" value={mapping.consent_note || ""} fields={parseResult.fields} onChange={(value) => updateMapping("consent_note", value)} />
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <CsvMetric label="Okunan satır" value={parseResult.totalRows.toString()} />
            <CsvMetric label="İçe aktarılacak" value={parseResult.data.length.toString()} tone="success" />
            <CsvMetric label="Hatalı" value={parseResult.errors.length.toString()} tone={parseResult.errors.length > 0 ? "warning" : "neutral"} />
            <CsvMetric label="Tekrar" value={parseResult.duplicates.length.toString()} tone={parseResult.duplicates.length > 0 ? "warning" : "neutral"} />
          </div>
          {exceedsLimit && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Bu import mevcut plan limitini aşar. Kalan kişi hakkı: {remainingLimit}.
            </div>
          )}

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <CsvMetric label="İzinli" value={consentCounts.opted_in.toString()} tone="success" />
            <CsvMetric label="İzinsiz" value={consentCounts.opted_out.toString()} tone={consentCounts.opted_out > 0 ? "warning" : "neutral"} />
            <CsvMetric label="Bilinmiyor" value={consentCounts.unknown.toString()} />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">İlk {preview.length} kayıt önizleme:</p>
          <ul className="space-y-1">
            {preview.map((c, i) => (
              <li key={i} className="text-sm text-gray-700">
                {c.first_name} {c.last_name} - {c.phone} - {consentLabel(c.consent_status || defaultConsentStatus)}
              </li>
            ))}
          </ul>
          </div>

          {(parseResult.errors.length > 0 || parseResult.duplicates.length > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-semibold">İçe aktarılmayacak satırlar</p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {parseResult.errors.slice(0, 8).map((error) => (
                  <li key={`error-${error.row}`}>{error.message}</li>
                ))}
                {parseResult.duplicates.slice(0, 8).map((duplicate) => (
                  <li key={`duplicate-${duplicate.row}`}>{duplicate.message}: {duplicate.phone}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleImport} disabled={loading || parseResult.data.length === 0 || exceedsLimit}>
              {loading ? "İçe aktarılıyor..." : `${parseResult.data.length} Kişiyi İçe Aktar`}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={loading}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MappingSelect({ label, value, fields, onChange }: { label: string; value: string; fields: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
        <option value="">Eşleştirme yok</option>
        {fields.map((field) => (
          <option key={field} value={field}>{field}</option>
        ))}
      </select>
    </label>
  )
}

function CsvMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  const classes = {
    neutral: "border-gray-200 bg-gray-50 text-gray-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  }

  return (
    <div className={`rounded-lg border p-3 ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
