"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import { Input } from "@/components/ui/input"

export default function LogsPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data: messages } = await supabase
      .from("sms_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    const companyIds = Array.from(new Set((messages ?? []).map((m) => m.company_id).filter(Boolean)))
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

  useEffect(() => { load() }, [])

  const filtered = messages.filter((m) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      m.company_name?.toLowerCase().includes(q) ||
      m.recipient?.includes(q) ||
      m.sender_id?.toLowerCase().includes(q) ||
      m.message?.toLowerCase().includes(q)
    )
  })

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gönderim Kayıtları"
        description="Tüm firmaların SMS gönderim kayıtlarını ve durumlarını takip edin."
      />
      <Card title="SMS Logları">
        <div className="mb-4">
          <Input
            placeholder="Firma, alıcı, başlık veya mesaj ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>Başlık</Th>
              <Th>Alıcı</Th>
              <Th>Mesaj</Th>
              <Th>Durum</Th>
              <Th>SMS Parçası</Th>
              <Th>Tarih</Th>
            </Tr>
          </THead>
          <TBody>
            {filtered.map((m) => (
              <Tr key={m.id}>
                <Td className="font-medium">{m.company_name}</Td>
                <Td>
                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    {m.sender_id}
                  </span>
                </Td>
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
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={7} className="text-center text-gray-500">Kayıt bulunamadı</Td>
              </Tr>
            )}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-gray-400">Son 200 kayıt gösteriliyor</p>
      </Card>
    </div>
  )
}
