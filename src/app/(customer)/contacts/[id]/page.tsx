"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { createClient } from "@/lib/supabase/client"
import type { Contact, Group, SmsMessage } from "@/types"

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function fullName(contact: Contact) {
  return `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`
}

function statusLabel(status: SmsMessage["status"]) {
  if (status === "delivered") return "Teslim edildi"
  if (status === "sent") return "Gönderildi"
  if (status === "failed") return "Hata"
  return "Bekliyor"
}

function statusTone(status: SmsMessage["status"]) {
  if (status === "delivered" || status === "sent") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

function isRecentContact(contact: Contact) {
  const createdAt = new Date(contact.created_at).getTime()
  if (Number.isNaN(createdAt)) return false
  return Date.now() - createdAt <= 1000 * 60 * 60 * 24 * 30
}

function contactTags(contact: Contact, group: Group | null) {
  const tags: string[] = []
  if (group?.name) tags.push(group.name)
  if (group?.name?.toLowerCase().includes("vip")) tags.push("VIP")
  if (contact.email) tags.push("E-posta var")
  if (isRecentContact(contact)) tags.push("Yeni kayıt")
  if (!group) tags.push("Segmentsiz")
  return Array.from(new Set(tags))
}

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>()
  const [contact, setContact] = useState<Contact | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!params.id) return

      setLoading(true)
      const supabase = createClient()
      const { data: contactRow } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", params.id)
        .maybeSingle()

      setContact(contactRow ?? null)

      if (contactRow?.group_id) {
        const { data: groupRow } = await supabase
          .from("groups")
          .select("*")
          .eq("id", contactRow.group_id)
          .maybeSingle()
        setGroup(groupRow ?? null)
      } else {
        setGroup(null)
      }

      if (contactRow?.company_id && contactRow?.phone) {
        const { data: messageRows } = await supabase
          .from("sms_messages")
          .select("*")
          .eq("company_id", contactRow.company_id)
          .eq("recipient", contactRow.phone)
          .order("created_at", { ascending: false })
          .limit(25)
        setMessages(messageRows ?? [])
      }

      setLoading(false)
    }

    load()
  }, [params.id])

  const tags = useMemo(() => contact ? contactTags(contact, group) : [], [contact, group])
  const deliveredCount = messages.filter((message) => message.status === "delivered").length
  const failedCount = messages.filter((message) => message.status === "failed").length
  const lastMessage = messages[0]

  if (loading) return <p>Yükleniyor...</p>

  if (!contact) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kişi Bulunamadı" description="Aradığınız CRM kaydı bulunamadı." actions={<Link href="/contacts"><Button>Listeye dön</Button></Link>} />
        <EmptyState title="Kayıt yok" description="Bu kişi silinmiş veya erişim yetkiniz dışında olabilir." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName(contact)}
        description="Müşteri profili, segment bilgisi ve SMS iletişim geçmişi."
        actions={<Link href="/contacts"><Button variant="secondary">Kişilere dön</Button></Link>}
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Toplam SMS" value={messages.length} description="Bu kişiye ait kayıt" tone="blue" />
        <StatCard title="Teslim Edilen" value={deliveredCount} description="Başarılı teslimat" tone="emerald" />
        <StatCard title="Hatalı" value={failedCount} description="Başarısız gönderim" tone="amber" />
        <StatCard title="Son Aktivite" value={lastMessage ? formatDate(lastMessage.created_at) : "-"} description="En güncel temas" tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Profil">
            <div className="space-y-4">
              <Info label="Ad Soyad" value={fullName(contact)} />
              <Info label="Telefon" value={contact.phone} />
              <Info label="E-posta" value={contact.email || "-"} />
              <Info label="Segment" value={group?.name || "Segmentsiz"} />
              <Info label="Kayıt Tarihi" value={formatDate(contact.created_at)} />
            </div>
          </Card>

          <Card title="Etiketler">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <StatusBadge key={tag} label={tag} tone={tag.toLowerCase().includes("vip") ? "purple" : "info"} />
              ))}
            </div>
          </Card>
        </div>

        <Card title="İletişim Geçmişi">
          {messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message) => (
                <div key={message.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={statusLabel(message.status)} tone={statusTone(message.status)} />
                      <span className="text-xs font-medium text-gray-500">{message.provider_name || "Provider yok"}</span>
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(message.created_at)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-gray-700">{message.message}</p>
                  <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                    <span>Mesaj ID: {message.provider_message_id || "-"}</span>
                    <span>DLR: {message.last_dlr_checked_at ? formatDate(message.last_dlr_checked_at) : "-"}</span>
                    <span>Final: {message.is_final ? "Evet" : "Hayır"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="SMS geçmişi yok" description="Bu kişiye gönderilen SMS kayıtları burada görünecek." />
          )}
        </Card>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-950">{value}</p>
    </div>
  )
}
