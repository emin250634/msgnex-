"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import { Input } from "@/components/ui/input"

export default function LogsPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
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

    const { data: logs } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    const actorIds = Array.from(new Set((logs ?? []).map((log) => log.actor_user_id).filter(Boolean)))
    const auditCompanyIds = Array.from(new Set((logs ?? []).map((log) => log.company_id).filter(Boolean)))

    const [{ data: actors }, { data: auditCompanies }] = await Promise.all([
      actorIds.length > 0
        ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
        : Promise.resolve({ data: [] }),
      auditCompanyIds.length > 0
        ? supabase.from("companies").select("id, name").in("id", auditCompanyIds)
        : Promise.resolve({ data: [] }),
    ])

    const actorMap: Record<string, string> = {}
    actors?.forEach((actor: any) => {
      actorMap[actor.id] = actor.full_name || actor.email || actor.id
    })

    const auditCompanyMap: Record<string, string> = {}
    auditCompanies?.forEach((company: any) => {
      auditCompanyMap[company.id] = company.name
    })

    const enrichedLogs = (logs || []).map((log) => ({
      ...log,
      actor_name: actorMap[log.actor_user_id] || log.actor_user_id || "-",
      company_name: auditCompanyMap[log.company_id] || log.company_id || "-",
    }))

    setMessages(enriched)
    setAuditLogs(enrichedLogs)
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

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      log.actor_name?.toLowerCase().includes(q) ||
      log.company_name?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q) ||
      log.target_type?.toLowerCase().includes(q) ||
      JSON.stringify(log.metadata ?? {}).toLowerCase().includes(q)
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
              <Th>Provider Birimi</Th>
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

      <Card title="Operasyon Audit Logları">
        <Table>
          <THead>
            <Tr>
              <Th>Tarih</Th>
              <Th>Admin</Th>
              <Th>Aksiyon</Th>
              <Th>Hedef</Th>
              <Th>Firma</Th>
              <Th>Detay</Th>
            </Tr>
          </THead>
          <TBody>
            {filteredAuditLogs.map((log) => (
              <Tr key={log.id}>
                <Td className="text-sm text-gray-500">{new Date(log.created_at).toLocaleString("tr-TR")}</Td>
                <Td className="font-medium">{log.actor_name}</Td>
                <Td>
                  <span className="rounded bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">
                    {log.action}
                  </span>
                </Td>
                <Td className="text-sm text-gray-700">
                  {log.target_type}
                  {log.target_id ? <span className="block font-mono text-xs text-gray-400">{String(log.target_id).slice(0, 8)}...</span> : null}
                </Td>
                <Td>{log.company_name}</Td>
                <Td className="max-w-sm truncate font-mono text-xs text-gray-500" title={JSON.stringify(log.metadata ?? {})}>
                  {JSON.stringify(log.metadata ?? {})}
                </Td>
              </Tr>
            ))}
            {filteredAuditLogs.length === 0 && (
              <Tr>
                <Td colSpan={6} className="text-center text-gray-500">Audit kaydı bulunamadı</Td>
              </Tr>
            )}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-gray-400">Son 100 operasyon kaydı gösteriliyor</p>
      </Card>
    </div>
  )
}
