"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { calculateSmsSegments, MAX_SMS_LENGTH } from "@/lib/sms-segments"
import { createClient } from "@/lib/supabase/client"
import { renderMessageTemplate, validateMessageTemplate } from "@/lib/message-template"
import { formatBirthDateForMessage } from "@/lib/automation/birthday"
import type { Group, SmsTemplate } from "@/types"

type DayOffset = 0 | 1 | 7

const dayOffsetOptions: { value: DayOffset; label: string }[] = [
  { value: 0, label: "Doğum günü aynı gün" },
  { value: 1, label: "1 gün önce" },
  { value: 7, label: "7 gün önce" },
]

const defaultMessage = "Merhaba {{ad}}, doğum gününüz kutlu olsun. Size özel kampanyalarımız için bizi takipte kalın."

export default function NewAutomationPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState("Firmanız")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [name, setName] = useState("Doğum Günü Kutlaması")
  const [targetGroupId, setTargetGroupId] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [message, setMessage] = useState(defaultMessage)
  const [sendTime, setSendTime] = useState("09:00")
  const [dayOffset, setDayOffset] = useState<DayOffset>(0)
  const [status, setStatus] = useState<"active" | "inactive">("inactive")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id, companies(name)")
      .maybeSingle()

    if (profileError || !profile?.company_id) {
      setError("Firma bilgisi yüklenemedi.")
      setLoading(false)
      return
    }

    setCompanyId(profile.company_id)
    const company = profile.companies as { name?: string | null } | null
    if (company?.name) setCompanyName(company.name)

    const [{ data: groupRows, error: groupError }, { data: templateRows, error: templateError }] = await Promise.all([
      supabase.from("groups").select("*").eq("company_id", profile.company_id).order("name"),
      supabase.from("sms_templates").select("*").eq("company_id", profile.company_id).order("name"),
    ])

    if (groupError || templateError) {
      setError("Segment veya şablon verileri yüklenemedi.")
      setLoading(false)
      return
    }

    setGroups(groupRows ?? [])
    setTemplates(templateRows ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const validation = useMemo(() => validateMessageTemplate(message), [message])
  const preview = useMemo(() => renderMessageTemplate(message, {
    ad: "Ayşe",
    soyad: "Demir",
    firma: companyName,
    telefon: "905321234567",
    dogum_gunu: formatBirthDateForMessage("1990-05-12"),
  }), [companyName, message])
  const segmentInfo = useMemo(() => calculateSmsSegments(preview), [preview])

  const handleTemplateSelect = (value: string) => {
    setTemplateId(value)
    const template = templates.find((item) => item.id === value)
    if (template) {
      setMessage(template.message)
      if (!name.trim() || name === "Doğum Günü Kutlaması") setName(`${template.name} Otomasyonu`)
    }
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!name.trim() || !message.trim()) {
      toast.error("Otomasyon adı ve mesaj zorunludur.")
      return
    }
    if (validation.unsupportedVariables.length > 0) {
      toast.error(`Desteklenmeyen değişken: ${validation.unsupportedVariables.join(", ")}`)
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from("automation_rules").insert({
      company_id: companyId,
      name: name.trim(),
      type: "birthday",
      status,
      target_group_id: targetGroupId || null,
      template_id: templateId || null,
      message: message.trim(),
      send_time: sendTime,
      timezone: "Europe/Istanbul",
      day_offset: dayOffset,
      requires_approval: true,
      created_by: user?.id ?? null,
    })

    setSaving(false)
    if (insertError) {
      toast.error("Otomasyon kaydedilemedi.")
      return
    }

    toast.success("Otomasyon kuralı oluşturuldu")
    router.push("/automations")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyon Oluştur" description="Doğum günü SMS otomasyonu kuralı oluşturun." />
        <LoadingState variant="cards" rows={3} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyon Oluştur" description="Doğum günü SMS otomasyonu kuralı oluşturun." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Oluştur"
        description="Doğum günü SMS otomasyonu kuralı oluşturun."
        actions={<Link href="/automations"><Button variant="secondary">Listeye Dön</Button></Link>}
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Güvenli Kurulum" tone="info" />
          <span className="font-semibold">Bu ekranda yalnız otomasyon kuralı kaydedilir.</span>
        </div>
        <p className="mt-2">Aday üretimi ve SMS kampanyasına aktarma sonraki fazda manuel onay kuyruğu üzerinden bağlanacak.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Kural Bilgileri">
          <div className="grid gap-5">
            <Input label="Otomasyon adı" value={name} onChange={(event) => setName(event.target.value)} />

            <Field label="Tür seçimi">
              <select disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <option>Doğum günü</option>
              </select>
            </Field>

            <Field label="Hedef segment">
              <select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Tüm kişiler</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </Field>

            <Field label="SMS şablonu">
              <select value={templateId} onChange={(event) => handleTemplateSelect(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Özel mesaj yaz</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </Field>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mesaj İçeriği</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                maxLength={MAX_SMS_LENGTH}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">{message.length}/{MAX_SMS_LENGTH}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Gönderim günü">
                <select value={dayOffset} onChange={(event) => setDayOffset(Number(event.target.value) as DayOffset)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {dayOffsetOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Input label="Gönderim saati" type="time" value={sendTime} onChange={(event) => setSendTime(event.target.value)} />
              <Field label="Durum">
                <select value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="inactive">Pasif</option>
                  <option value="active">Aktif</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TogglePreview title="Manuel onay" description="İlk canlı sürümde zorunlu" checked />
              <TogglePreview title="SMS gönderimi" description="Sonraki fazda kuyruğa bağlanacak" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={saving || !name.trim() || !message.trim() || validation.unsupportedVariables.length > 0}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
              <Link href="/automations"><Button variant="secondary">İptal</Button></Link>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Önizleme">
            <div className="space-y-4">
              <StatusBadge label="SMS gönderilmez" tone="warning" />
              <p className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{preview}</p>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <PreviewMetric label="Encoding" value={segmentInfo.encoding} />
                <PreviewMetric label="Segment" value={segmentInfo.segments.toString()} />
                <PreviewMetric label="Karakter" value={segmentInfo.units.toString()} />
                <PreviewMetric label="Değişken" value={validation.variables.length.toString()} />
              </div>
              {validation.unsupportedVariables.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Desteklenmeyen değişkenler: {validation.unsupportedVariables.join(", ")}
                </div>
              )}
            </div>
          </Card>

          <Card title="Desteklenen Değişkenler">
            <div className="flex flex-wrap gap-2 text-sm">
              {["{{ad}}", "{{soyad}}", "{{firma}}", "{{telefon}}", "{{dogum_gunu}}"].map((variable) => (
                <span key={variable} className="rounded-full bg-gray-100 px-3 py-1 font-mono text-xs font-semibold text-gray-700">{variable}</span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function TogglePreview({ title, description, checked = false }: { title: string; description: string; checked?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <span>
        <span className="block text-sm font-semibold text-gray-950">{title}</span>
        <span className="mt-1 block text-xs text-gray-500">{description}</span>
      </span>
      <input type="checkbox" checked={checked} readOnly disabled className="h-5 w-5 rounded border-gray-300" />
    </label>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-950">{value}</p>
    </div>
  )
}
