"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { MAX_SMS_LENGTH } from "@/lib/sms-segments"
import { createClient } from "@/lib/supabase/client"
import type { SmsTemplate } from "@/types"

type TemplateCategory = SmsTemplate["category"]

const templateCategories: { value: TemplateCategory; label: string }[] = [
  { value: "general", label: "Genel" },
  { value: "campaign", label: "Kampanya" },
  { value: "announcement", label: "Duyuru" },
  { value: "appointment", label: "Randevu" },
  { value: "payment", label: "Ödeme" },
  { value: "support", label: "Destek" },
]

function categoryLabel(value?: string | null) {
  return templateCategories.find((category) => category.value === value)?.label || "Genel"
}

function templateSmsHref(template: SmsTemplate) {
  const params = new URLSearchParams({
    source: "template",
    message: template.message,
  })

  return `/sms?${params.toString()}`
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<TemplateCategory>("general")
  const [message, setMessage] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError("")
    const sb = createClient()
    const { data: profile, error: profileError } = await sb.from("profiles").select("company_id").maybeSingle()
    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }
    if (!profile?.company_id) {
      setLoading(false)
      return
    }
    const { data, error: templateError } = await sb.from("sms_templates").select("*").eq("company_id", profile.company_id).order("name")
    if (templateError) setError(templateError.message)
    setTemplates(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setName("")
    setCategory("general")
    setMessage("")
    setEditingId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    if (!name.trim() || !message.trim()) return
    const sb = createClient()
    const { data: profile } = await sb.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) {
      toast.error("Firma bilgisi bulunamadı")
      return
    }

    if (editingId) {
      await sb.from("sms_templates").update({ name: name.trim(), category, message }).eq("id", editingId)
      toast.success("Şablon güncellendi")
    } else {
      await sb.from("sms_templates").insert({ company_id: profile.company_id, name: name.trim(), category, message })
      toast.success("Şablon oluşturuldu")
    }

    resetForm()
    load()
  }

  const handleEdit = (template: SmsTemplate) => {
    setName(template.name)
    setCategory(template.category || "general")
    setMessage(template.message)
    setEditingId(template.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const sb = createClient()
    await sb.from("sms_templates").delete().eq("id", id)
    toast.success("Şablon silindi")
    load()
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter((template) =>
      template.name.toLowerCase().includes(q) ||
      template.message.toLowerCase().includes(q) ||
      categoryLabel(template.category).toLowerCase().includes(q)
    )
  }, [templates, search])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="SMS Şablonları" description="Sık kullanılan mesaj içeriklerini yönetin ve kampanya hazırlığını hızlandırın." />
        <LoadingState variant="table" rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="SMS Şablonları" description="Sık kullanılan mesaj içeriklerini yönetin ve kampanya hazırlığını hızlandırın." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Şablonları"
        description="Sık kullanılan mesaj içeriklerini yönetin ve kampanya hazırlığını hızlandırın."
        actions={
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setName(""); setCategory("general"); setMessage("") }}>
            {showForm ? "Kapat" : "Şablon Oluştur"}
          </Button>
        }
      />

      {showForm && (
        <Card title={editingId ? "Şablon Düzenle" : "Yeni Şablon"}>
          <div className="space-y-4">
            <Input label="Şablon Adı" placeholder="Örn: Kampanya duyurusu" value={name} onChange={(event) => setName(event.target.value)} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Kategori</label>
              <select value={category} onChange={(event) => setCategory(event.target.value as TemplateCategory)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {templateCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mesaj İçeriği</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
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
              <Button variant="secondary" onClick={resetForm}>İptal</Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Şablon Listesi">
        <div className="mb-4">
          <Input placeholder="Şablon ara..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {filtered.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Şablon Adı</Th>
                <Th>Kategori</Th>
                <Th>Mesaj</Th>
                <Th>Oluşturulma</Th>
                <Th></Th>
              </Tr>
            </THead>
            <TBody>
              {filtered.map((template) => (
                <Tr key={template.id}>
                  <Td className="font-medium">{template.name}</Td>
                  <Td className="text-sm text-gray-600">{categoryLabel(template.category)}</Td>
                  <Td className="max-w-sm truncate text-sm text-gray-600">{template.message}</Td>
                  <Td className="text-sm text-gray-500">{new Date(template.created_at).toLocaleDateString("tr-TR")}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Link href={templateSmsHref(template)}>
                        <Button variant="secondary" size="sm">SMS ile Kullan</Button>
                      </Link>
                      <Button size="sm" onClick={() => handleEdit(template)}>Düzenle</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(template.id)}>Sil</Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">ŞB</span>}
            title={search ? "Eşleşen şablon yok" : "Henüz şablon yok"}
            description={search ? "Arama ifadesini değiştirerek tekrar deneyin." : "Sık kullandığınız mesajları şablon olarak kaydedin."}
            action={<Button variant="secondary" onClick={search ? () => setSearch("") : () => setShowForm(true)}>{search ? "Aramayı Temizle" : "Şablon Oluştur"}</Button>}
          />
        )}
      </Card>
    </div>
  )
}
