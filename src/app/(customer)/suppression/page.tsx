"use client"

import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { parseSuppressionCsv } from "@/services/suppression-csv-parser"
import type { SuppressionEntry } from "@/types"

export default function SuppressionPage() {
  const [entries, setEntries] = useState<SuppressionEntry[]>([])
  const [phone, setPhone] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error: loadError } = await supabase.from("suppression_list").select("*").order("created_at", { ascending: false })
    if (loadError) {
      setError(loadError.message)
      toast.error("Kara liste yüklenemedi")
    }
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) =>
      entry.phone.includes(q) ||
      entry.reason?.toLowerCase().includes(q)
    )
  }, [entries, search])

  const reasonedCount = entries.filter((entry) => Boolean(entry.reason)).length
  const lastEntry = entries[0]

  const handleAdd = async () => {
    if (!phone.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { error: addError } = await supabase.rpc("add_suppression_entry", { p_phone: phone, p_reason: reason || null })
    if (addError) toast.error(addError.message)
    else {
      toast.success("Numara kara listeye eklendi")
      setPhone("")
      await load()
    }
    setSaving(false)
  }

  const handleCsv = async (file?: File) => {
    if (!file) return
    setSaving(true)
    const parsed = parseSuppressionCsv(await file.text())
    if (parsed.errors.length > 0) {
      toast.error(parsed.errors[0])
      setSaving(false)
      return
    }
    const supabase = createClient()
    const { data, error: csvError } = await supabase.rpc("add_suppression_entries", { p_phones: parsed.phones, p_reason: reason || null })
    if (csvError) toast.error(csvError.message)
    else {
      toast.success(`${data} numara kara listeye işlendi`)
      await load()
    }
    setSaving(false)
  }

  const handleRemove = async (entry: SuppressionEntry) => {
    if (!window.confirm(`${entry.phone} kara listeden kaldırılsın mı?`)) return
    const supabase = createClient()
    const { error: removeError } = await supabase.rpc("remove_suppression_entry", { p_id: entry.id })
    if (removeError) toast.error(removeError.message)
    else {
      toast.success("Numara kara listeden kaldırıldı")
      load()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kara Liste"
        description="SMS gönderilmemesi gereken numaraları yönetin ve toplu içe aktarım yapın."
      />

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Kara Listedeki Numara" value={entries.length} description="Gönderimden otomatik çıkarılır" tone="rose" />
        <StatCard title="Sebep Girilen" value={reasonedCount} description="İptal/ret kaydı açıklamalı" tone="slate" />
        <StatCard title="Son Eklenen" value={lastEntry ? new Date(lastEntry.created_at).toLocaleDateString("tr-TR") : "-"} description={lastEntry?.phone || "Kayıt yok"} tone="amber" />
      </div>

      <Card title="Numara Ekle">
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            Kara listedeki numaralar SMS gönderiminde otomatik atlanır. Bu liste ret/iptal talepleri, hatalı numaralar veya iletişim izni olmayan kayıtlar için kullanılmalıdır.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Örn: 05551234567" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Input placeholder="Sebep (opsiyonel)" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleAdd} disabled={saving || !phone.trim()}>Ekle</Button>
            <label className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              CSV ile Toplu Ekle
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={saving} onChange={(event) => handleCsv(event.target.files?.[0])} />
            </label>
            <span className="text-xs text-gray-500">CSV dosyasında telefon, gsm, cep veya mobile başlıklı bir sütun olmalı.</span>
          </div>
        </div>
      </Card>
      <Card title={`Kara Listedeki Numaralar (${entries.length})`}>
        <div className="mb-4">
          <Input
            placeholder="Telefon veya sebep ile ara..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {loading ? (
          <LoadingState variant="table" rows={5} />
        ) : error ? (
          <ErrorState description={error} onRetry={load} />
        ) : filteredEntries.length > 0 ? (
          <Table>
            <THead><Tr><Th>Telefon</Th><Th>Sebep</Th><Th>Eklenme Tarihi</Th><Th></Th></Tr></THead>
            <TBody>
              {filteredEntries.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="font-mono">{entry.phone}</Td>
                  <Td>{entry.reason || "-"}</Td>
                  <Td>{new Date(entry.created_at).toLocaleString("tr-TR")}</Td>
                  <Td><Button variant="danger" size="sm" onClick={() => handleRemove(entry)}>Kaldır</Button></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">KL</span>}
            title={entries.length > 0 ? "Aramaya uygun kayıt yok" : "Kara listede numara yok"}
            description={entries.length > 0 ? "Arama metnini temizleyerek tüm kara listeyi görebilirsiniz." : "SMS gönderilmemesi gereken numaraları ekleyerek güvenli gönderim yapabilirsiniz."}
            action={<Button variant="secondary" onClick={entries.length > 0 ? () => setSearch("") : () => setPhone("05")}>{entries.length > 0 ? "Aramayı Temizle" : "Numara Ekle"}</Button>}
          />
        )}
      </Card>
    </div>
  )
}
