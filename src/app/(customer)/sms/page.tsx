"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { calculateSmsSegments, MAX_SMS_LENGTH } from "@/lib/sms-segments"
import { createClient } from "@/lib/supabase/client"
import type { Contact, Group, SmsTemplate } from "@/types"

const NO_SEGMENT = "__none__"
const ALL_CONTACTS = "__all__"

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

export default function SmsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [selectedGroup, setSelectedGroup] = useState(NO_SEGMENT)
  const [manualNumbers, setManualNumbers] = useState("")
  const [message, setMessage] = useState("")
  const [senderId, setSenderId] = useState("")
  const [loading, setLoading] = useState(false)
  const [queuedCampaignId, setQueuedCampaignId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [templateName, setTemplateName] = useState("")
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [providerReady, setProviderReady] = useState(false)
  const [providerStatus, setProviderStatus] = useState("Kurulum bekliyor")
  const [confirmAllContacts, setConfirmAllContacts] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [suppressionPhones, setSuppressionPhones] = useState<string[]>([])

  useEffect(() => {
    const sb = createClient()
    sb.from("contacts").select("*").then(({ data }) => setContacts(data ?? []))
    sb.from("groups").select("*").then(({ data }) => setGroups(data ?? []))
    sb.from("sms_templates").select("*").order("name").then(({ data }) => setTemplates(data ?? []))
    sb.from("suppression_list").select("phone").then(({ data }) => {
      setSuppressionPhones((data ?? []).map((entry) => normalizePhone(String(entry.phone))).filter(Boolean))
    })
    sb.from("profiles").select("company_id").maybeSingle().then(async ({ data: profile }) => {
      if (profile?.company_id) {
        const { data: providerData } = await sb.rpc("get_customer_provider_status")
        const provider = providerData?.[0]
        if (provider?.sender_header) setSenderId(provider.sender_header)
        const ready = Boolean(provider?.has_provider && provider.sender_header && provider.connection_status !== "disabled")
        setProviderReady(ready)
        setProviderStatus(ready ? "Provider hazır" : "Provider kurulumu bekliyor")
      }
    })
  }, [])

  const manualRecipients = useMemo(() => manualNumbers
    .split(/[\n,]+/)
    .map((number) => number.trim())
    .filter(Boolean), [manualNumbers])

  const selectedRecipients = useMemo(() => {
    const groupRecipients =
      selectedGroup === ALL_CONTACTS
        ? contacts.map((contact) => contact.phone)
        : selectedGroup !== NO_SEGMENT
          ? contacts.filter((contact) => contact.group_id === selectedGroup).map((contact) => contact.phone)
          : []

    return Array.from(new Set([...groupRecipients, ...manualRecipients].map(normalizePhone).filter(Boolean)))
  }, [contacts, manualRecipients, selectedGroup])

  const suppressionSet = useMemo(() => new Set(suppressionPhones), [suppressionPhones])
  const suppressedRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => suppressionSet.has(recipient)),
    [selectedRecipients, suppressionSet]
  )
  const sendableRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => !suppressionSet.has(recipient)),
    [selectedRecipients, suppressionSet]
  )

  const recipientCount = selectedRecipients.length
  const sendableRecipientCount = sendableRecipients.length
  const suppressedRecipientCount = suppressedRecipients.length
  const segmentInfo = calculateSmsSegments(message)
  const cost = sendableRecipientCount * segmentInfo.segments
  const selectedGroupName = selectedGroup === ALL_CONTACTS
    ? "Tüm Kişiler"
    : selectedGroup === NO_SEGMENT
      ? manualRecipients.length > 0 ? "Manuel numara girişi" : "Alıcı seçilmedi"
      : groups.find((group) => group.id === selectedGroup)?.name || "Seçili segment"
  const hasAudience = selectedGroup !== NO_SEGMENT || manualRecipients.length > 0
  const requiresAllContactsApproval = selectedGroup === ALL_CONTACTS
  const canPrepareSend = Boolean(message.trim()) && hasAudience && sendableRecipientCount > 0 && providerReady && (!requiresAllContactsApproval || confirmAllContacts)

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplate(id)
    const template = templates.find((item) => item.id === id)
    if (template) {
      setMessage(template.message)
      setShowSaveTemplate(false)
      setShowFinalConfirm(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !message.trim()) return
    const sb = createClient()
    const { data: profile } = await sb.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) {
      toast.error("Firma bilgisi bulunamadı")
      return
    }
    const { error } = await sb.from("sms_templates").insert({
      company_id: profile.company_id,
      name: templateName.trim(),
      message,
    })
    if (error) {
      toast.error("Şablon kaydedilemedi")
      return
    }
    toast.success("Şablon kaydedildi")
    setTemplateName("")
    setShowSaveTemplate(false)
    sb.from("sms_templates").select("*").order("name").then(({ data }) => setTemplates(data ?? []))
  }

  const handleDeleteTemplate = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation()
    const sb = createClient()
    await sb.from("sms_templates").delete().eq("id", id)
    setSelectedTemplate("")
    sb.from("sms_templates").select("*").order("name").then(({ data }) => setTemplates(data ?? []))
    toast.success("Şablon silindi")
  }

  const handlePrepareSend = () => {
    if (!message.trim()) {
      toast.error("Mesaj içeriği zorunludur")
      return
    }
    if (!hasAudience || recipientCount === 0) {
      toast.error("Devam etmek için segment seçin veya manuel numara girin")
      return
    }
    if (sendableRecipientCount === 0) {
      toast.error("Seçilen alıcıların tamamı kara listede")
      return
    }
    if (requiresAllContactsApproval && !confirmAllContacts) {
      toast.error("Tüm kişilere gönderim için ek onayı işaretleyin")
      return
    }
    if (!providerReady) {
      toast.error("Provider bağlantısı hazır olmadan gönderim yapılamaz")
      return
    }
    setShowFinalConfirm(true)
  }

  const handleSend = async () => {
    setLoading(true)
    setQueuedCampaignId(null)

    const recipients = selectedRecipients
    if (recipients.length === 0) {
      toast.error("Gönderilecek kişi bulunamadı. Segment seçin veya numara girin.")
      setLoading(false)
      return
    }

    const response = await fetch("/api/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients, message }),
    })
    const data = await response.json()

    if (!response.ok) {
      toast.error(data.error || "SMS gönderilemedi")
      setLoading(false)
      return
    }

    setQueuedCampaignId(data.campaignId)
    setShowFinalConfirm(false)
    toast.success(`Kampanya kuyruğa alındı.${data.skippedRecipients ? ` ${data.skippedRecipients} kara listedeki numara atlandı.` : ""}`)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Gönder"
        description="Alıcı seçimi, mesaj içeriği ve provider bağlantısını kontrol ederek güvenli kampanya oluşturun."
        actions={
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-right">
            <p className="text-xs font-medium text-blue-700">Provider</p>
            <p className="text-sm font-semibold text-blue-800">{providerStatus}</p>
          </div>
        }
      />

      <Card title="Şablon Seç">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedTemplate}
            onChange={(event) => handleTemplateSelect(event.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Şablon seçin (isteğe bağlı)</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          {selectedTemplate && (
            <Button variant="danger" size="sm" onClick={(event) => handleDeleteTemplate(event, selectedTemplate)}>
              Şablonu Sil
            </Button>
          )}
        </div>
      </Card>

      <Card title="Alıcılar">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Segment Seç</label>
            <select
              value={selectedGroup}
              onChange={(event) => {
                setSelectedGroup(event.target.value)
                setConfirmAllContacts(false)
                setShowFinalConfirm(false)
              }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value={NO_SEGMENT}>Alıcı seçilmedi</option>
              <option value={ALL_CONTACTS}>Tüm Kişiler ({contacts.length})</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({contacts.filter((contact) => contact.group_id === group.id).length})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">Varsayılan olarak hiçbir alıcı seçili değildir.</p>
          </div>

          {selectedGroup === ALL_CONTACTS && (
            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <input
                type="checkbox"
                checked={confirmAllContacts}
                onChange={(event) => {
                  setConfirmAllContacts(event.target.checked)
                  setShowFinalConfirm(false)
                }}
                className="mt-0.5 h-4 w-4 rounded border-amber-300"
              />
              <span>
                <span className="block font-semibold">Tüm kişilere gönderimi onaylıyorum.</span>
                <span className="mt-1 block">Bu seçim kayıtlı tüm kişileri kapsar. Devam etmek için bu ek onay zorunludur.</span>
              </span>
            </label>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Manuel Numara Girişi
            </label>
            <textarea
              value={manualNumbers}
              onChange={(event) => {
                setManualNumbers(event.target.value)
                setShowFinalConfirm(false)
              }}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder={"Numaraları virgül veya yeni satır ile ayırın\nÖrn: 05551234567, 05559876543"}
            />
            <p className="mt-1 text-xs text-gray-500">
              {manualNumbers ? `${manualRecipients.length} numara algılandı` : "Segment seçmeden manuel numara girerek de devam edebilirsiniz."}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Mesaj">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Sağlayıcı SMS Başlığı</p>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="font-mono text-sm font-medium text-gray-900">
                {senderId || "Henüz tanımlanmadı"}
              </span>
              <StatusBadge label={providerReady ? "Provider hazır" : "Kurulum bekliyor"} tone={providerReady ? "success" : "warning"} />
            </div>
            {!providerReady && (
              <p className="mt-1 text-xs text-amber-600">
                SMS gönderebilmek için firmanızın Netgsm provider bağlantısı ve onaylı başlığı hazır olmalıdır.
              </p>
            )}
          </div>

          <div>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                setShowFinalConfirm(false)
              }}
              rows={5}
              maxLength={MAX_SMS_LENGTH}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder={`SMS mesajınızı yazın (max ${MAX_SMS_LENGTH} karakter)`}
            />
            <p className="mt-1 text-xs text-gray-500">
              {message.length}/{MAX_SMS_LENGTH} karakter · {segmentInfo.encoding} · {segmentInfo.segments} SMS parçası
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setShowSaveTemplate(!showSaveTemplate)} variant="secondary">
              {showSaveTemplate ? "İptal" : "Şablon Kaydet"}
            </Button>
          </div>

          {showSaveTemplate && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Şablon adı"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
              <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                Kaydet
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Gönderim Öncesi Özet">
        <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-6">
          <SummaryItem label="Seçilen alıcı" value={recipientCount.toString()} />
          <SummaryItem label="Gönderilecek" value={sendableRecipientCount.toString()} />
          <SummaryItem label="Kara listede atlanacak" value={suppressedRecipientCount.toString()} emphasize={suppressedRecipientCount > 0} />
          <SummaryItem label="Tahmini sağlayıcı kredi kullanımı" value={`${cost} SMS parçası`} />
          <SummaryItem label="Segment / kaynak" value={selectedGroupName} />
          <SummaryItem label="Mesaj parçası" value={`${segmentInfo.segments} parça`} />
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <RiskCheck label="Provider başlığı" value={senderId || "Tanımlı değil"} ok={providerReady && Boolean(senderId)} />
          <RiskCheck label="Kara liste kontrolü" value={suppressedRecipientCount > 0 ? `${suppressedRecipientCount} numara atlanacak` : "Atlanacak numara yok"} ok />
          <RiskCheck label="Gönderim zamanı" value="Hemen / kuyruğa alınacak" ok />
        </div>
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase text-gray-500">Mesaj önizleme</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{message || "Mesaj içeriği henüz girilmedi."}</p>
        </div>
      </Card>

      {showFinalConfirm && (
        <Card title="Son Onay">
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="text-lg font-semibold text-blue-950">{sendableRecipientCount} kişiye SMS gönderilecek</p>
              <p className="mt-1">
                Tahmini {cost} SMS parçası firmanızın sağlayıcı hesabındaki krediden kullanılacak.
                {suppressedRecipientCount > 0 ? ` ${suppressedRecipientCount} kara listedeki numara gönderimden çıkarılacak.` : ""}
                {" "}Kampanya kuyruğa alınır.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleSend} disabled={loading}>
                {loading ? "Gönderiliyor..." : `${sendableRecipientCount} Kişiye SMS Gönder`}
              </Button>
              <Button variant="secondary" onClick={() => setShowFinalConfirm(false)} disabled={loading}>Geri Dön</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={handlePrepareSend} disabled={loading || !canPrepareSend}>
            Gönderimi İncele
          </Button>
          {!hasAudience && <span className="text-sm text-amber-700">Devam etmek için segment seçin veya manuel numara girin.</span>}
          {queuedCampaignId && (
            <span className="text-sm text-blue-600">Kampanya kuyruğa alındı.</span>
          )}
        </div>
      </Card>
    </div>
  )
}

function SummaryItem({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className={emphasize ? "mt-2 text-lg font-semibold text-red-700" : "mt-2 text-lg font-semibold text-gray-950"}>{value}</p>
    </div>
  )
}

function RiskCheck({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={ok ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4" : "rounded-xl border border-amber-200 bg-amber-50 p-4"}>
      <p className={ok ? "text-xs font-semibold uppercase text-emerald-700" : "text-xs font-semibold uppercase text-amber-700"}>{label}</p>
      <p className={ok ? "mt-2 text-sm font-semibold text-emerald-950" : "mt-2 text-sm font-semibold text-amber-950"}>{value}</p>
    </div>
  )
}
