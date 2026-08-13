"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { calculateSmsSegments, MAX_SMS_LENGTH } from "@/lib/sms-segments"
import { createClient } from "@/lib/supabase/client"
import type { Contact, Group, SmsCampaignDraft, SmsTemplate } from "@/types"

const NO_SEGMENT = "__none__"
const ALL_CONTACTS = "__all__"

const templateCategoryLabels: Record<SmsTemplate["category"], string> = {
  general: "Genel",
  campaign: "Kampanya",
  announcement: "Duyuru",
  appointment: "Randevu",
  payment: "Ödeme",
  support: "Destek",
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

function formatNumber(value: number) {
  return value.toLocaleString("tr-TR")
}

function draftAudienceLabel(draft: SmsCampaignDraft, groups: Group[]) {
  if (draft.audience_type === "all") return "Tüm kişiler"
  if (draft.audience_type === "group") {
    return groups.find((group) => group.id === draft.group_id)?.name || "Segment"
  }
  if (draft.audience_type === "manual") return `${draft.manual_recipients?.length ?? 0} manuel numara`
  return "Alıcı seçilmedi"
}

export default function SmsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [campaignDrafts, setCampaignDrafts] = useState<SmsCampaignDraft[]>([])
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
  const [planLimits, setPlanLimits] = useState<{
    plan: CompanyPlan
    campaign_recipient_limit: number
  } | null>(null)
  const [confirmAllContacts, setConfirmAllContacts] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [suppressionPhones, setSuppressionPhones] = useState<string[]>([])
  const [prefillNotice, setPrefillNotice] = useState("")
  const [draftName, setDraftName] = useState("")
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)

  const loadCampaignDrafts = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb
      .from("sms_campaign_drafts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(10)

    setCampaignDrafts(data ?? [])
  }, [])

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
    sb.rpc("get_customer_plan_limits").then(({ data }) => setPlanLimits(data?.[0] ?? null))
    loadCampaignDrafts()
  }, [loadCampaignDrafts])

  useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    const prefillMessage = params.get("message")
    const prefillGroup = params.get("group")
    const source = params.get("source")
    const templateName = params.get("templateName")
    let handledPrefill = false

    if (source === "segment-rule") {
      try {
        const storedRecipients = JSON.parse(sessionStorage.getItem("msgnex_segment_rule_recipients") || "[]")
        const ruleName = sessionStorage.getItem("msgnex_segment_rule_name") || "Dinamik segment"
        if (Array.isArray(storedRecipients) && storedRecipients.length > 0) {
          setSelectedGroup(NO_SEGMENT)
          setManualNumbers(storedRecipients.map(String).join("\n"))
          setDraftName(`${ruleName} - ${new Date().toLocaleDateString("tr-TR")}`)
          setPrefillNotice(`${ruleName} hedef kitlesi manuel alıcı olarak hazırlandı. Gönderim öncesi kontroller uygulanacaktır.`)
          handledPrefill = true
        }
      } catch {
        handledPrefill = false
      } finally {
        sessionStorage.removeItem("msgnex_segment_rule_recipients")
        sessionStorage.removeItem("msgnex_segment_rule_name")
      }
    }

    if (!handledPrefill && !prefillMessage && !prefillGroup) return

    if (prefillMessage) setMessage(prefillMessage.slice(0, MAX_SMS_LENGTH))
    if (prefillGroup) setSelectedGroup(prefillGroup)
    setShowFinalConfirm(false)
    setConfirmAllContacts(false)
    if (source === "campaign-copy") {
      setPrefillNotice("Önceki kampanya içeriği hazırlandı. Alıcıları ve mesajı kontrol edip yeniden gönderebilirsiniz.")
    } else if (source === "template") {
      if (templateName) setDraftName(`${templateName} kampanyası`)
      setPrefillNotice("Seçilen şablon mesaj alanına aktarıldı. Alıcıları seçip gönderimi inceleyebilirsiniz.")
    }
    window.history.replaceState(null, "", "/sms")
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
  const contactConsentMap = useMemo(() => {
    const map = new Map<string, Contact["consent_status"]>()
    contacts.forEach((contact) => {
      const normalizedPhone = normalizePhone(contact.phone)
      if (normalizedPhone) map.set(normalizedPhone, contact.consent_status || "unknown")
    })
    return map
  }, [contacts])
  const suppressedRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => suppressionSet.has(recipient)),
    [selectedRecipients, suppressionSet]
  )
  const optedOutRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => contactConsentMap.get(recipient) === "opted_out"),
    [contactConsentMap, selectedRecipients]
  )
  const unknownConsentRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => (contactConsentMap.get(recipient) ?? "unknown") === "unknown"),
    [contactConsentMap, selectedRecipients]
  )
  const sendableRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => !suppressionSet.has(recipient) && contactConsentMap.get(recipient) !== "opted_out"),
    [contactConsentMap, selectedRecipients, suppressionSet]
  )

  const recipientCount = selectedRecipients.length
  const sendableRecipientCount = sendableRecipients.length
  const suppressedRecipientCount = suppressedRecipients.length
  const optedOutRecipientCount = optedOutRecipients.length
  const unknownConsentRecipientCount = unknownConsentRecipients.length
  const skippedRecipientCount = suppressedRecipientCount + optedOutRecipientCount
  const segmentInfo = calculateSmsSegments(message)
  const cost = sendableRecipientCount * segmentInfo.segments
  const sendableRate = recipientCount > 0 ? Math.round((sendableRecipientCount / recipientCount) * 100) : 0
  const selectedGroupName = selectedGroup === ALL_CONTACTS
    ? "Tüm Kişiler"
    : selectedGroup === NO_SEGMENT
      ? manualRecipients.length > 0 ? "Manuel numara girişi" : "Alıcı seçilmedi"
      : groups.find((group) => group.id === selectedGroup)?.name || "Seçili segment"
  const hasAudience = selectedGroup !== NO_SEGMENT || manualRecipients.length > 0
  const draftAudienceType: SmsCampaignDraft["audience_type"] =
    selectedGroup === ALL_CONTACTS
      ? "all"
      : selectedGroup !== NO_SEGMENT
        ? "group"
        : manualRecipients.length > 0
          ? "manual"
          : "none"
  const requiresAllContactsApproval = selectedGroup === ALL_CONTACTS
  const recipientLimitExceeded = Boolean(planLimits && sendableRecipientCount > planLimits.campaign_recipient_limit)
  const canPrepareSend = Boolean(message.trim()) && hasAudience && sendableRecipientCount > 0 && providerReady && !recipientLimitExceeded && (!requiresAllContactsApproval || confirmAllContacts)
  const canSaveDraft = Boolean(draftName.trim() && message.trim())
  const activeDraft = useMemo(
    () => campaignDrafts.find((draft) => draft.id === activeDraftId) ?? null,
    [activeDraftId, campaignDrafts]
  )

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

  const buildDraftPayload = (companyId: string) => ({
    company_id: companyId,
    name: draftName.trim(),
    message,
    audience_type: draftAudienceType,
    group_id: draftAudienceType === "group" ? selectedGroup : null,
    manual_recipients: draftAudienceType === "manual" ? manualRecipients.map(normalizePhone).filter(Boolean) : [],
    updated_at: new Date().toISOString(),
  })

  const handleSaveDraft = async (mode: "create" | "update" = "create") => {
    if (!canSaveDraft) return

    setDraftSaving(true)
    const sb = createClient()
    const { data: profile, error: profileError } = await sb.from("profiles").select("company_id").maybeSingle()

    if (profileError || !profile?.company_id) {
      toast.error(profileError?.message || "Firma bilgisi bulunamadı")
      setDraftSaving(false)
      return
    }

    const payload = buildDraftPayload(profile.company_id)
    const { data: savedDraft, error } = mode === "update" && activeDraftId
      ? await sb.from("sms_campaign_drafts").update(payload).eq("id", activeDraftId).select("*").single()
      : await sb.from("sms_campaign_drafts").insert(payload).select("*").single()

    setDraftSaving(false)

    if (error) {
      toast.error(mode === "update" ? "Taslak güncellenemedi" : "Taslak kaydedilemedi")
      return
    }

    if (savedDraft?.id) setActiveDraftId(savedDraft.id)
    toast.success(mode === "update" ? "Taslak güncellendi" : "Kampanya taslağı kaydedildi")
    loadCampaignDrafts()
  }

  const handleLoadDraft = (draft: SmsCampaignDraft) => {
    setMessage(draft.message)
    setDraftName(draft.name)
    setActiveDraftId(draft.id)
    setShowFinalConfirm(false)
    setConfirmAllContacts(false)

    if (draft.audience_type === "all") {
      setSelectedGroup(ALL_CONTACTS)
      setManualNumbers("")
    } else if (draft.audience_type === "group" && draft.group_id) {
      setSelectedGroup(draft.group_id)
      setManualNumbers("")
    } else if (draft.audience_type === "manual") {
      setSelectedGroup(NO_SEGMENT)
      setManualNumbers((draft.manual_recipients ?? []).join("\n"))
    } else {
      setSelectedGroup(NO_SEGMENT)
      setManualNumbers("")
    }

    toast.success("Taslak yüklendi")
  }

  const clearActiveDraft = () => {
    setActiveDraftId(null)
    setDraftName("")
  }

  const handleDeleteDraft = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from("sms_campaign_drafts").delete().eq("id", id)

    if (error) {
      toast.error("Taslak silinemedi")
      return
    }

    toast.success("Taslak silindi")
    if (activeDraftId === id) clearActiveDraft()
    loadCampaignDrafts()
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
      toast.error("Seçilen alıcıların tamamı kara listede veya izinsiz")
      return
    }
    if (requiresAllContactsApproval && !confirmAllContacts) {
      toast.error("Tüm kişilere gönderim için ek onayı işaretleyin")
      return
    }
    if (recipientLimitExceeded && planLimits) {
      toast.error(`Bu plan tek kampanyada en fazla ${planLimits.campaign_recipient_limit} alıcı destekler.`)
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

    const recipients = sendableRecipients
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
    if (activeDraftId) {
      await createClient().from("sms_campaign_drafts").delete().eq("id", activeDraftId)
      clearActiveDraft()
      loadCampaignDrafts()
    }
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

      {prefillNotice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {prefillNotice}
        </div>
      )}

      <Card title="Şablon Seç">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedTemplate}
            onChange={(event) => handleTemplateSelect(event.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Şablon seçin (isteğe bağlı)</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {templateCategoryLabels[template.category || "general"]} - {template.name}
              </option>
            ))}
          </select>
          {selectedTemplate && (
            <Button variant="danger" size="sm" onClick={(event) => handleDeleteTemplate(event, selectedTemplate)}>
              Şablonu Sil
            </Button>
          )}
        </div>
      </Card>

      <Card title="Kampanya Taslakları">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            {campaignDrafts.length > 0 ? (
              <div className="space-y-3">
                {campaignDrafts.map((draft) => (
                  <div key={draft.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-gray-950">{draft.name}</p>
                          {activeDraftId === draft.id && <StatusBadge label="Aktif" tone="info" />}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600">{draft.message}</p>
                        <p className="mt-2 text-xs text-gray-500">
                          {draftAudienceLabel(draft, groups)} · {new Date(draft.updated_at).toLocaleDateString("tr-TR")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" size="sm" onClick={() => handleLoadDraft(draft)}>Yükle</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteDraft(draft.id)}>Sil</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                Henüz kayıtlı kampanya taslağı yok.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-blue-950">{activeDraft ? "Aktif taslak" : "Mevcut çalışmayı taslak kaydet"}</p>
              {activeDraft && <StatusBadge label={activeDraft.name} tone="info" />}
            </div>
            <p className="mt-1 text-xs leading-5 text-blue-800">
              {activeDraft
                ? "Yüklenen taslağı güncelleyebilir veya mevcut çalışmayı yeni taslak olarak saklayabilirsiniz."
                : "Mesaj, alıcı kaynağı, manuel numaralar ve dinamik kuraldan gelen hedef kitle taslakta saklanır; gönderim kuyruğa alınmaz."}
            </p>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Taslak adı"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <div className="space-y-2">
                {activeDraftId && (
                  <Button className="w-full" onClick={() => handleSaveDraft("update")} disabled={!canSaveDraft || draftSaving}>
                    {draftSaving ? "Güncelleniyor..." : "Taslağı Güncelle"}
                  </Button>
                )}
                <Button className="w-full" variant={activeDraftId ? "secondary" : "primary"} onClick={() => handleSaveDraft("create")} disabled={!canSaveDraft || draftSaving}>
                  {draftSaving ? "Kaydediliyor..." : activeDraftId ? "Yeni Taslak Olarak Kaydet" : "Taslak Kaydet"}
                </Button>
                {activeDraftId && (
                  <Button className="w-full" variant="secondary" onClick={clearActiveDraft} disabled={draftSaving}>
                    Aktif Taslağı Bırak
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Alıcılar">
        <div className="space-y-4">
          {planLimits && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {PLAN_LABELS[planLimits.plan]} planı tek kampanyada en fazla {planLimits.campaign_recipient_limit.toLocaleString("tr-TR")} net alıcı destekler.
            </div>
          )}
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
          {recipientLimitExceeded && planLimits && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Seçilen net alıcı sayısı plan limitini aşıyor. Net alıcı: {sendableRecipientCount}, limit: {planLimits.campaign_recipient_limit}.
            </div>
          )}
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
        <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Seçilen alıcı" value={formatNumber(recipientCount)} hint={selectedGroupName} />
          <SummaryItem label="Net gönderilecek" value={formatNumber(sendableRecipientCount)} hint={`Uygun alıcı oranı %${sendableRate}`} tone="success" />
          <SummaryItem label="Atlanacak alıcı" value={formatNumber(skippedRecipientCount)} hint={`${suppressedRecipientCount} kara liste, ${optedOutRecipientCount} izinsiz`} tone={skippedRecipientCount > 0 ? "warning" : "neutral"} />
          <SummaryItem label="Tahmini kullanım" value={formatNumber(cost)} hint={`${segmentInfo.segments} parça x ${formatNumber(sendableRecipientCount)} alıcı`} tone="info" />
        </div>
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <SummaryItem label="Mesaj uzunluğu" value={`${message.length}/${MAX_SMS_LENGTH}`} hint={`${segmentInfo.encoding} kodlama`} />
          <SummaryItem label="SMS parça sayısı" value={`${segmentInfo.segments} parça`} hint="Sağlayıcı hesabınızdan buna göre düşer" />
          <SummaryItem label="İzin durumu bilinmeyen" value={formatNumber(unknownConsentRecipientCount)} hint="Bilinmeyenler gönderime dahil edilir" tone={unknownConsentRecipientCount > 0 ? "warning" : "neutral"} />
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <RiskCheck label="Provider başlığı" value={senderId || "Tanımlı değil"} ok={providerReady && Boolean(senderId)} />
          <RiskCheck label="İzin kontrolü" value={optedOutRecipientCount > 0 ? `${optedOutRecipientCount} izinsiz numara atlanacak` : `${unknownConsentRecipientCount} izin durumu bilinmeyen alıcı`} ok={optedOutRecipientCount === 0} />
          <RiskCheck label="Kara liste kontrolü" value={suppressedRecipientCount > 0 ? `${suppressedRecipientCount} numara atlanacak` : "Atlanacak numara yok"} ok={suppressedRecipientCount === 0} />
          <RiskCheck label="Gönderim zamanı" value="Hemen / kuyruğa alınacak" ok />
          <RiskCheck label="Segment / kaynak" value={selectedGroupName} ok />
          <RiskCheck label="Plan limiti" value={planLimits ? `${formatNumber(sendableRecipientCount)} / ${formatNumber(planLimits.campaign_recipient_limit)} net alıcı` : "Plan limiti yükleniyor"} ok={!recipientLimitExceeded} />
        </div>
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-gray-500">Mesaj önizleme</p>
            <StatusBadge label={`${segmentInfo.segments} SMS parçası`} tone={segmentInfo.segments > 1 ? "warning" : "info"} />
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-700">{message || "Mesaj içeriği henüz girilmedi."}</p>
        </div>
      </Card>

      {showFinalConfirm && (
        <Card title="Son Onay">
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="text-lg font-semibold text-blue-950">{formatNumber(sendableRecipientCount)} kişiye SMS gönderilecek</p>
              <p className="mt-1">
                Tahmini {formatNumber(cost)} SMS parçası firmanızın sağlayıcı hesabındaki krediden kullanılacak.
                {suppressedRecipientCount > 0 ? ` ${suppressedRecipientCount} kara listedeki numara gönderimden çıkarılacak.` : ""}
                {optedOutRecipientCount > 0 ? ` ${optedOutRecipientCount} izinsiz numara gönderimden çıkarılacak.` : ""}
                {" "}Kampanya kuyruğa alınır.
              </p>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <ConfirmMetric label="Gönderici başlığı" value={senderId || "-"} />
              <ConfirmMetric label="Alıcı kaynağı" value={selectedGroupName} />
              <ConfirmMetric label="Mesaj parçası" value={`${segmentInfo.segments} parça`} />
              <ConfirmMetric label="Atlanan alıcı" value={formatNumber(skippedRecipientCount)} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleSend} disabled={loading}>
                {loading ? "Gönderiliyor..." : `${formatNumber(sendableRecipientCount)} Kişiye SMS Gönder`}
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

function SummaryItem({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warning" | "info"
}) {
  const valueClass = {
    neutral: "text-gray-950",
    success: "text-emerald-700",
    warning: "text-amber-700",
    info: "text-blue-700",
  }[tone]

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs leading-5 text-gray-500">{hint}</p>}
    </div>
  )
}

function ConfirmMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-gray-950">{value}</p>
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
