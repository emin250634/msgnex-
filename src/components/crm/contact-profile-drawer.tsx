"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { createClient } from "@/lib/supabase/client"
import type { Contact, Group, SmsMessage } from "@/types"

interface ContactProfileDrawerProps {
  contact: Contact | null
  group?: Group | null
  tags: string[]
  onClose: () => void
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function statusTone(status: SmsMessage["status"]) {
  if (status === "delivered" || status === "sent") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

function consentLabel(value?: Contact["consent_status"] | null) {
  if (value === "opted_in") return "İzinli"
  if (value === "opted_out") return "İzinsiz"
  return "Bilinmiyor"
}

function consentTone(value?: Contact["consent_status"] | null) {
  if (value === "opted_in") return "success" as const
  if (value === "opted_out") return "danger" as const
  return "warning" as const
}

export function ContactProfileDrawer({ contact, group, tags, onClose }: ContactProfileDrawerProps) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contact) return

    const supabase = createClient()
    setLoading(true)
    supabase
      .from("sms_messages")
      .select("*")
      .eq("company_id", contact.company_id)
      .eq("recipient", contact.phone)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setMessages(data ?? [])
        setLoading(false)
      })
  }, [contact])

  if (!contact) return null

  const fullName = `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Detayı kapat" className="absolute inset-0 bg-gray-950/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-700">CRM Profili</p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-950">{fullName}</h2>
              <p className="mt-1 text-sm text-gray-500">{contact.phone}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onClose}>Kapat</Button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="E-posta" value={contact.email || "-"} />
              <Info label="Grup / Segment" value={group?.name || "Atanmamış"} />
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Ticari ileti izni</p>
                <div className="mt-1">
                  <StatusBadge label={consentLabel(contact.consent_status)} tone={consentTone(contact.consent_status)} />
                </div>
              </div>
              <Info label="İzin Kaynağı" value={contact.consent_source || "-"} />
              <Info label="Kayıt Tarihi" value={formatDate(contact.created_at)} />
              <Info label="Son Güncelleme" value={formatDate(contact.updated_at)} />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-950">Etiketler</h3>
              <Link href={`/contacts/${contact.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800">
                Tam profili aç
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <StatusBadge key={tag} label={tag} tone={tag.toLowerCase().includes("vip") ? "purple" : "info"} />
              ))}
              {tags.length === 0 && <StatusBadge label="Etiket yok" tone="neutral" />}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-950">Son SMS Geçmişi</h3>
            {loading ? (
              <p className="text-sm text-gray-500">Yükleniyor...</p>
            ) : messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <StatusBadge label={message.status} tone={statusTone(message.status)} />
                      <span className="text-xs text-gray-500">{formatDate(message.created_at)}</span>
                    </div>
                    <p className="mt-2 max-h-12 overflow-hidden text-sm text-gray-700">{message.message}</p>
                    <p className="mt-2 text-xs text-gray-500">Provider: {message.provider_name || "-"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                Bu kişi için henüz SMS kaydı yok.
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-950">{value}</p>
    </div>
  )
}
