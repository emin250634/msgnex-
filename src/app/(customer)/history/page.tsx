"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { SmsMessage } from "@/types"

export default function HistoryPage() {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Gönderim Geçmişi</h1>
      <Card>
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
            {messages.map((m) => (
              <Tr key={m.id}>
                <Td className="font-medium">{m.recipient}</Td>
                <Td className="max-w-xs truncate">{m.message}</Td>
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
            {messages.length === 0 && (
              <Tr>
                <Td colSpan={5} className="text-center text-gray-500">Gönderim bulunamadı</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
