"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { SmsTemplate } from "@/types"
import { MAX_SMS_LENGTH } from "@/lib/sms-segments"

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = async () => {
    const sb = createClient()
    const { data: profile } = await sb.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) { setLoading(false); return }
    const { data } = await sb.from("sms_templates").select("*").eq("company_id", profile.company_id).order("name")
    setTemplates(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!name.trim() || !message.trim()) return
    const sb = createClient()
    const { data: profile } = await sb.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) { toast.error("Firma bilgisi bulunamadı"); return }

    if (editingId) {
      await sb.from("sms_templates").update({ name: name.trim(), message }).eq("id", editingId)
      toast.success("Şablon güncellendi")
    } else {
      await sb.from("sms_templates").insert({ company_id: profile.company_id, name: name.trim(), message })
      toast.success("Şablon oluşturuldu")
    }

    setName("")
    setMessage("")
    setEditingId(null)
    setShowForm(false)
    load()
  }

  const handleEdit = (t: SmsTemplate) => {
    setName(t.name)
    setMessage(t.message)
    setEditingId(t.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const sb = createClient()
    await sb.from("sms_templates").delete().eq("id", id)
    toast.success("Şablon silindi")
    load()
  }

  const handleUseTemplate = (t: SmsTemplate) => {
    setName(t.name)
    setMessage(t.message)
    setEditingId(t.id)
    setShowForm(true)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter((t) => t.name.toLowerCase().includes(q) || t.message.toLowerCase().includes(q))
  }, [templates, search])

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Şablonları"
        description="Sık kullanılan mesaj içeriklerini yönetin ve kampanya hazırlığını hızlandırın."
        actions={
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setName(""); setMessage("") }}>
            {showForm ? "Kapat" : "Şablon Oluştur"}
          </Button>
        }
      />

      {showForm && (
        <Card title={editingId ? "Şablon Düzenle" : "Yeni Şablon"}>
          <div className="space-y-4">
            <Input
              label="Şablon Adı"
              placeholder="Örn: Toplantı Hatırlatması"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mesaj İçeriği</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={MAX_SMS_LENGTH}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="SMS mesaj içeriği"
              />
              <p className="mt-1 text-xs text-gray-500">{message.length}/{MAX_SMS_LENGTH}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!name.trim() || !message.trim()}>
                {editingId ? "Güncelle" : "Kaydet"}
              </Button>
              <Button variant="danger" onClick={() => { setShowForm(false); setEditingId(null); setName(""); setMessage("") }}>
                İptal
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Şablon Listesi">
        <div className="mb-4">
          <Input
            placeholder="Şablon ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Table>
          <THead>
            <Tr>
              <Th>Şablon Adı</Th>
              <Th>Mesaj</Th>
              <Th>Oluşturulma</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {filtered.map((t) => (
              <Tr key={t.id}>
                <Td className="font-medium">{t.name}</Td>
                <Td className="max-w-sm truncate text-sm text-gray-600">{t.message}</Td>
                <Td className="text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString("tr-TR")}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleEdit(t)}>Düzenle</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(t.id)}>Sil</Button>
                  </div>
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={4} className="text-center text-gray-500">
                  {search ? "Eşleşen şablon bulunamadı" : "Henüz şablon oluşturulmamış"}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
