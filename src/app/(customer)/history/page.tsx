"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import type { SmsMessage } from "@/types"

const PAGE_SIZE = 20

function messageStatusLabel(status: SmsMessage["status"]) {
  if (status === "sent") return "Gönderildi"
  if (status === "delivered") return "Teslim Edildi"
  if (status === "failed") return "Hata"
  return "Bekliyor"
}

function messageStatusTone(status: SmsMessage["status"]) {
  if (status === "sent" || status === "delivered") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function shortId(value?: string | null) {
  if (!value) return "-"
  return value.length > 20 ? `${value.slice(0, 9)}...${value.slice(-7)}` : value
}

export default function HistoryPage() {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("sms_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMessages(data ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return messages
    const q = search.toLowerCase()
    return messages.filter((message) =>
      message.recipient.includes(q) ||
      message.message.toLowerCase().includes(q) ||
      message.status.toLowerCase().includes(q) ||
      (message.provider_name || "").toLowerCase().includes(q) ||
      (message.provider_status_code || "").toLowerCase().includes(q) ||
      (message.provider_status_text || "").toLowerCase().includes(q) ||
      (message.provider_message_id || "").toLowerCase().includes(q)
    )
  }, [messages, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => { setPage(1) }, [search])

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gönderim Geçmişi"
        description="Numara bazlı SMS durumlarını, provider yanıtlarını ve DLR zamanlarını izleyin."
      />

      <Card title="SMS Geçmişi">
        <div className="mb-4">
          <Input
            placeholder="Numara, mesaj, durum, provider veya provider id ile ara..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>Alıcı</Th>
              <Th>Mesaj</Th>
              <Th>Durum</Th>
              <Th>Provider</Th>
              <Th>Provider Yanıtı</Th>
              <Th>Final</Th>
              <Th>Teslim/Hata</Th>
              <Th>DLR Son Kontrol</Th>
              <Th>Kredi</Th>
            </Tr>
          </THead>
          <TBody>
            {paged.map((message) => (
              <Tr key={message.id}>
                <Td className="font-medium">{message.recipient}</Td>
                <Td className="max-w-xs truncate" title={message.message}>{message.message}</Td>
                <Td>
                  <StatusBadge label={messageStatusLabel(message.status)} tone={messageStatusTone(message.status)} />
                </Td>
                <Td>
                  <div className="text-sm font-medium text-gray-900">{message.provider_name || "-"}</div>
                  <div className="font-mono text-xs text-gray-500" title={message.provider_message_id || undefined}>
                    {shortId(message.provider_message_id)}
                  </div>
                </Td>
                <Td>
                  <div className="font-mono text-xs text-gray-700">{message.provider_status_code || "-"}</div>
                  <div className="mt-1 max-w-[220px] truncate text-xs text-gray-500" title={message.provider_status_text || undefined}>
                    {message.provider_status_text || "-"}
                  </div>
                </Td>
                <Td>
                  <StatusBadge
                    label={message.is_final ? "Final" : "Bekliyor"}
                    tone={message.is_final ? "success" : "warning"}
                  />
                </Td>
                <Td className="text-sm text-gray-500">
                  {message.delivered_at ? formatDate(message.delivered_at) : formatDate(message.failed_at)}
                </Td>
                <Td className="text-sm text-gray-500">{formatDate(message.last_dlr_checked_at)}</Td>
                <Td>{message.credits_cost}</Td>
              </Tr>
            ))}
            {paged.length === 0 && (
              <Tr>
                <Td colSpan={9} className="text-center text-gray-500">
                  {search ? "Eşleşen kayıt bulunamadı" : "Gönderim bulunamadı"}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">
              Toplam {filtered.length} kayıt (sayfa {page}/{totalPages})
            </p>
            <div className="flex gap-1">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Geri</Button>
              <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>İleri</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
