"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendBulkSms } from "@/services/sms-provider"
import { showToast } from "@/components/ui/toast"
import type { Contact, Group } from "@/types"

export default function SmsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState("")
  const [message, setMessage] = useState("")
  const [senderId, setSenderId] = useState("Msgnex")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: number; fail: number } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from("contacts").select("*").then(({ data }) => setContacts(data ?? []))
    supabase.from("groups").select("*").then(({ data }) => setGroups(data ?? []))
  }, [])

  const getRecipients = (): string[] => {
    if (!selectedGroup) return contacts.map((c) => c.phone)
    return contacts.filter((c) => c.group_id === selectedGroup).map((c) => c.phone)
  }

  const handleSend = async () => {
    if (!message.trim()) return
    setLoading(true)
    setResult(null)

    const recipients = getRecipients()
    if (recipients.length === 0) {
      showToast("Gönderilecek kişi bulunamadı", "error")
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data: profile } = await supabase.from("profiles").select("company_id").single()
    if (!profile?.company_id) {
      showToast("Firma bilgisi bulunamadı", "error")
      setLoading(false)
      return
    }

    const { data: credits } = await supabase
      .from("sms_credits")
      .select("balance")
      .eq("company_id", profile.company_id)
      .single()

    if (!credits || credits.balance < recipients.length) {
      showToast("Yetersiz bakiye!", "error")
      setLoading(false)
      return
    }

    const results = await sendBulkSms(recipients, message, senderId)

    const smsRecords = results.map((r, i) => ({
      company_id: profile.company_id,
      sender_id: senderId,
      recipient: recipients[i],
      message,
      status: r.success ? "sent" : "failed",
      credits_cost: 1,
      sent_at: r.success ? new Date().toISOString() : null,
    }))

    const successCount = smsRecords.filter((r) => r.status === "sent").length

    await supabase.from("sms_messages").insert(smsRecords)
    await supabase
      .from("sms_credits")
      .update({ balance: credits.balance - recipients.length })
      .eq("company_id", profile.company_id)

    await supabase.from("credit_transactions").insert({
      company_id: profile.company_id,
      amount: -recipients.length,
      type: "deduct",
      note: `SMS gönderimi (${recipients.length} adet)`,
    })

    setResult({
      success: successCount,
      fail: recipients.length - successCount,
    })

    showToast(`SMS gönderildi! ${successCount} başarılı, ${recipients.length - successCount} hata`, "success")
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">SMS Gönder</h1>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grup Seç (opsiyonel)</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Tüm Kişiler ({contacts.length})</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({contacts.filter((c) => c.group_id === g.id).length})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Gönderici Adı"
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mesaj</label>
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

          <div className="flex items-center gap-3">
            <Button onClick={handleSend} disabled={loading || !message.trim()}>
              {loading ? "Gönderiliyor..." : `${getRecipients().length} Kişiye Gönder`}
            </Button>
            {result && (
              <div className="flex gap-3 text-sm">
                <span className="text-green-600">✓ {result.success} başarılı</span>
                {result.fail > 0 && <span className="text-red-600">✗ {result.fail} hata</span>}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
