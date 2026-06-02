"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendBulkSms } from "@/services/sms-provider"
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
  const [result, setResult] = useState<{ success: number; fail: number } | null>(null)
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
  const cost = recipientCount

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
    setResult(null)

    const recipients = getRecipients()
    if (recipients.length === 0) {
      toast.error("Gönderilecek kişi bulunamadı. Grup seçin veya numara girin.")
      setLoading(false)
      return
    }

    const sb = createClient()
    const { data: profile } = await sb.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) {
      toast.error("Firma bilgisi bulunamadı")
      setLoading(false)
      return
    }

    const { data: credits } = await sb
      .from("sms_credits")
      .select("balance")
      .eq("company_id", profile.company_id)
      .maybeSingle()

    if (!credits || credits.balance < recipients.length) {
      toast.error(`Yetersiz bakiye! ${recipients.length} kredi gerekli, mevcut: ${credits?.balance ?? 0}`)
      setLoading(false)
      return
    }

    const results = await sendBulkSms(recipients, message, senderId)
    const successCount = results.filter((r) => r.success).length

    await sb.from("sms_messages").insert(
      results.map((r, i) => ({
        company_id: profile.company_id,
        sender_id: senderId,
        recipient: recipients[i],
        message,
        status: r.success ? "sent" : "failed",
        credits_cost: 1,
        sent_at: r.success ? new Date().toISOString() : null,
      }))
    )

    const { data: deducted } = await sb.rpc("deduct_sms_credits", {
      p_company_id: profile.company_id,
      p_amount: recipients.length,
    })

    if (deducted === false) {
      toast.error("Kredi düşülemedi! Admin ile iletişime geçin.")
      setLoading(false)
      return
    }

    await sb.from("credit_transactions").insert({
      company_id: profile.company_id,
      amount: -recipients.length,
      type: "deduct",
      note: `SMS gönderimi (${recipients.length} adet)`,
    })

    setBalance(credits.balance - recipients.length)
    setResult({
      success: successCount,
      fail: recipients.length - successCount,
    })

    toast.success(`SMS gönderildi! ${successCount} başarılı, ${recipients.length - successCount} hata`)
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
          <Input
            label="Gönderici Adı (SMS Başlığı)"
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
          />
          {!senderApproved && senderId && (
            <p className="text-xs text-amber-600">
              SMS başlığı henüz admin onayından geçmedi. Gönderim yapılsa da başlık değişebilir.
            </p>
          )}

          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={160}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="SMS mesajınızı yazın (max 160 karakter)"
            />
            <p className="mt-1 text-xs text-gray-500">{message.length}/160</p>
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
              <span className="text-gray-500">Birim Kredi</span>
              <span className="font-medium">1 SMS = 1 Kredi</span>
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
          <Button onClick={handleSend} disabled={loading || !message.trim() || cost > balance}>
            {loading ? "Gönderiliyor..." : `${recipientCount} Kişiye Gönder`}
          </Button>
          {result && (
            <div className="flex gap-3 text-sm">
              <span className="text-green-600">✓ {result.success} başarılı</span>
              {result.fail > 0 && <span className="text-red-600">✗ {result.fail} hata</span>}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
