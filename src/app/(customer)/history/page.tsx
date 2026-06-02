"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { SmsMessage } from "@/types"

const PAGE_SIZE = 20

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
    return messages.filter((m) =>
      m.recipient.includes(q) || m.message.toLowerCase().includes(q) || m.status.toLowerCase().includes(q)
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
      <h1 className="text-2xl font-bold text-gray-900">Gönderim Geçmişi</h1>
      <Card title="SMS Geçmişi">
        <div className="mb-4">
          <Input
            placeholder="Numara, mesaj veya durum ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>Alıcı</Th>
              <Th>Mesaj</Th>
              <Th>Durum</Th>
              <Th>Kredi</Th>
              <Th>Tarih</Th>
            </Tr>
          </THead>
          <TBody>
            {paged.map((m) => (
              <Tr key={m.id}>
                <Td className="font-medium">{m.recipient}</Td>
                <Td className="max-w-xs truncate" title={m.message}>{m.message}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    m.status === "sent" || m.status === "delivered"
                      ? "bg-green-100 text-green-700"
                      : m.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {m.status === "sent" ? "Gönderildi" : m.status === "delivered" ? "Teslim Edildi" : m.status === "failed" ? "Hata" : "Bekliyor"}
                  </span>
                </Td>
                <Td>{m.credits_cost}</Td>
                <Td className="text-sm text-gray-500">
                  {new Date(m.created_at).toLocaleString("tr-TR")}
                </Td>
              </Tr>
            ))}
            {paged.length === 0 && (
              <Tr>
                <Td colSpan={5} className="text-center text-gray-500">
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
