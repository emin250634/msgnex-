"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { SmsMessage } from "@/types"

export default function LogsPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      const { data: messages } = await supabase
        .from("sms_messages")
        .select("*")
        .order("created_at", { ascending: false })

      const companyIds = [...new Set(messages?.map((m) => m.company_id) || [])]
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", companyIds)

      const companyMap: Record<string, string> = {}
      companies?.forEach((c: any) => { companyMap[c.id] = c.name })

      const enriched = (messages || []).map((m) => ({
        ...m,
        company_name: companyMap[m.company_id] || "-",
      }))

      setMessages(enriched)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Gönderim Kayıtları</h1>
      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
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
                <Td className="font-medium">{m.company_name}</Td>
                <Td>{m.recipient}</Td>
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
                <Td colSpan={6} className="text-center text-gray-500">Kayıt bulunamadı</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
