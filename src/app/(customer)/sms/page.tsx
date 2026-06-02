"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { calculateSmsSegments, MAX_SMS_LENGTH } from "@/lib/sms-segments"
import toast from "react-hot-toast"
import type { Contact, Group, SmsTemplate } from "@/types"

export default function SmsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [selectedGroup, setSelectedGroup] = useState("")
  const [manualNumbers, setManualNumbers] = useState("")
  const [message, setMessage] = useState("")
  const [senderId, setSenderId] = useState("")
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(false)
  const [queuedCampaignId, setQueuedCampaignId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [templateName, setTemplateName] = useState("")
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [senderApproved, setSenderApproved] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.from("contacts").select("*").then(({ data }) => setContacts(data ?? []))
    sb.from("groups").select("*").then(({ data }) => setGroups(data ?? []))
    sb.from("sms_templates").select("*").order("name").then(({ data }) => setTemplates(data ?? []))
    sb.from("profiles").select("company_id").maybeSingle().then(async ({ data: profile }) => {
      if (profile?.company_id) {
        const { data: company } = await sb.from("companies").select("sender_name, sender_approved").eq("id", profile.company_id).single()
        if (company?.sender_name) setSenderId(company.sender_name)
        setSenderApproved(company?.sender_approved ?? false)
        const { data: credits } = await sb.from("sms_credits").select("balance").eq("company_id", profile.company_id).maybeSingle()
        if (credits) setBalance(credits.balance)
      }
    })
  }, [])

  const getRecipients = useCallback((): string[] => {
    const groupRecipients = selectedGroup
      ? contacts.filter((c) => c.group_id === selectedGroup).map((c) => c.phone)
      : selectedGroup === "" ? contacts.map((c) => c.phone) : []

    const manual = manualNumbers
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean)

    return Array.from(new Set([...groupRecipients, ...manual]))
  }, [contacts, selectedGroup, manualNumbers])

  const recipientCount = getRecipients().length
  const segmentInfo = calculateSmsSegments(message)
  const cost = recipientCount * segmentInfo.segments

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplate(id)
    const tpl = templates.find((t) => t.id === id)
    if (tpl) {
      setMessage(tpl.message)
      setShowSaveTemplate(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !message.trim()) return
    const sb = createClient()
    const { data: profile } = await sb.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) { toast.error("Firma bilgisi bulunamadı"); return }
    const { error } = await sb.from("sms_templates").insert({
      company_id: profile.company_id,
      name: templateName.trim(),
      message,
    })
    if (error) { toast.error("Şablon kaydedilemedi"); return }
    toast.success("Şablon kaydedildi!")
    setTemplateName("")
    setShowSaveTemplate(false)
    sb.from("sms_templates").select("*").order("name").then(({ data }) => setTemplates(data ?? []))
  }

  const handleDeleteTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const sb = createClient()
    await sb.from("sms_templates").delete().eq("id", id)
    setSelectedTemplate("")
    sb.from("sms_templates").select("*").order("name").then(({ data }) => setTemplates(data ?? []))
    toast.success("Şablon silindi")
  }

  const handleSend = async () => {
    if (!message.trim()) return
    setLoading(true)
    setQueuedCampaignId(null)

    const recipients = getRecipients()
    if (recipients.length === 0) {
      toast.error("Gönderilecek kişi bulunamadı. Grup seçin veya numara girin.")
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

    setBalance(data.balance)
    setQueuedCampaignId(data.campaignId)
    toast.success(`Kampanya kuyruğa alındı. ${data.reservedCredits} kredi rezerve edildi.${data.skippedRecipients ? ` ${data.skippedRecipients} kara listedeki numara atlandı.` : ""}`)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">SMS Gönder</h1>
        <div className="text-right">
          <p className="text-sm text-gray-500">Kalan Kredi</p>
          <p className="text-xl font-bold text-primary-600">{balance}</p>
        </div>
      </div>

      <Card title="Şablon Seç">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Şablon seçin (isteğe bağlı)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {selectedTemplate && (
            <Button variant="danger" size="sm" onClick={(e) => handleDeleteTemplate(e, selectedTemplate)}>
              Şablonu Sil
            </Button>
          )}
        </div>
      </Card>

      <Card title="Alıcılar">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grup Seç (opsiyonel)</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Tüm Kişiler ({contacts.length})</option>
              <option value="__none__">Grup seçme (sadece manuel)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({contacts.filter((c) => c.group_id === g.id).length})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Manuel Numara Girişi (opsiyonel)
            </label>
            <textarea
              value={manualNumbers}
              onChange={(e) => setManualNumbers(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Numaraları virgül veya yeni satır ile ayırın&#10;Örn: 05551234567, 05559876543"
            />
            <p className="mt-1 text-xs text-gray-500">
              {manualNumbers ? `${manualNumbers.split(/[\n,]+/).filter(Boolean).length} numara algılandı` : ""}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Mesaj">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Gönderici Adı (SMS Başlığı)</p>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="font-mono text-sm font-medium text-gray-900">
                {senderId || "Henüz tanımlanmadı"}
              </span>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                senderApproved
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {senderApproved ? "Onaylı" : "Admin onayı bekliyor"}
              </span>
            </div>
            {!senderApproved && (
              <p className="mt-1 text-xs text-amber-600">
                SMS gönderebilmek için başlığınızın admin tarafından onaylanması gerekir.
              </p>
            )}
          </div>

          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
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
            <div className="flex gap-2">
              <Input
                placeholder="Şablon adı"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                Kaydet
              </Button>
            </div>
          )}
        </div>
      </Card>

      {recipientCount > 0 && (
        <Card title="Gönderim Özeti">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Alıcı Sayısı</span>
              <span className="font-medium">{recipientCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mesaj Parçası</span>
              <span className="font-medium">{segmentInfo.segments} parça × {recipientCount} alıcı</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <span className="font-medium">Toplam Maliyet</span>
              <span className={`font-bold ${cost > balance ? "text-red-600" : "text-primary-600"}`}>
                {cost} Kredi
              </span>
            </div>
            {cost > balance && (
              <p className="text-xs text-red-600">Yetersiz bakiye! {cost - balance} kredi eksik.</p>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3">
          <Button onClick={handleSend} disabled={loading || !message.trim() || cost > balance || !senderApproved}>
            {loading ? "Gönderiliyor..." : `${recipientCount} Kişiye Gönder`}
          </Button>
          {queuedCampaignId && (
            <span className="text-sm text-blue-600">Kampanya kuyruğa alındı.</span>
          )}
        </div>
      </Card>
    </div>
  )
}
