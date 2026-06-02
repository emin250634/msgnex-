"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { parseContactCsv } from "@/services/csv-parser"
import { importContactsFromCsv } from "@/services/contacts"
import type { CsvContactRow } from "@/types"

interface CsvUploadProps {
  groupId?: string
  onComplete: (imported: number, errors: { row: number; message: string }[]) => void
}

export function CsvUpload({ groupId, onComplete }: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<CsvContactRow[]>([])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const result = parseContactCsv(text)

    if (result.errors.length > 0 && result.data.length === 0) {
      onComplete(0, result.errors)
      return
    }

    setPreview(result.data.slice(0, 5))
    setLoading(true)

    try {
      const res = await importContactsFromCsv(result.data, groupId)
      onComplete(res.imported, result.errors)
    } catch (err) {
      onComplete(0, [{ row: 0, message: (err as Error).message }])
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
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
      {preview.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-medium text-gray-500">
            İlk {preview.length} kayıt önizleme:
          </p>
          <ul className="space-y-1">
            {preview.map((c, i) => (
              <li key={i} className="text-sm text-gray-700">
                {c.first_name} {c.last_name} - {c.phone}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
