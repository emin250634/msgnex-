"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import { parseSuppressionCsv } from "@/services/suppression-csv-parser"
import toast from "react-hot-toast"
import type { SuppressionEntry } from "@/types"

export default function SuppressionPage() {
  const [entries, setEntries] = useState<SuppressionEntry[]>([])
  const [phone, setPhone] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from("suppression_list").select("*").order("created_at", { ascending: false })
    if (error) toast.error("Kara liste yüklenemedi")
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!phone.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.rpc("add_suppression_entry", { p_phone: phone, p_reason: reason || null })
    if (error) toast.error(error.message)
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
    const { data, error } = await supabase.rpc("add_suppression_entries", { p_phones: parsed.phones, p_reason: reason || null })
    if (error) toast.error(error.message)
    else {
      toast.success(`${data} numara kara listeye işlendi`)
      await load()
    }
    setSaving(false)
  }

  const handleRemove = async (entry: SuppressionEntry) => {
    if (!window.confirm(`${entry.phone} kara listeden kaldırılsın mı?`)) return
    const supabase = createClient()
    const { error } = await supabase.rpc("remove_suppression_entry", { p_id: entry.id })
    if (error) toast.error(error.message)
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
      <Card title="Numara Ekle">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Örn: 05551234567" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Input placeholder="Sebep (opsiyonel)" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleAdd} disabled={saving || !phone.trim()}>Ekle</Button>
            <label className="cursor-pointer rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              CSV ile Toplu Ekle
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={saving} onChange={(event) => handleCsv(event.target.files?.[0])} />
            </label>
            <span className="text-xs text-gray-500">CSV dosyasında telefon veya gsm başlıklı bir sütun olmalı.</span>
          </div>
        </div>
      </Card>
      <Card title={`Kara Listedeki Numaralar (${entries.length})`}>
        {loading ? <p>Yükleniyor...</p> : (
          <Table>
            <THead><Tr><Th>Telefon</Th><Th>Sebep</Th><Th>Eklenme Tarihi</Th><Th></Th></Tr></THead>
            <TBody>
              {entries.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="font-mono">{entry.phone}</Td>
                  <Td>{entry.reason || "-"}</Td>
                  <Td>{new Date(entry.created_at).toLocaleString("tr-TR")}</Td>
                  <Td><Button variant="danger" size="sm" onClick={() => handleRemove(entry)}>Kaldır</Button></Td>
                </Tr>
              ))}
              {entries.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-500">Kara listede numara bulunmuyor.</Td></Tr>}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
