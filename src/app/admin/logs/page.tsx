"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function csvValue(value: unknown) {
  if (value === null || value === undefined) return ""
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function LogsPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [auditSearch, setAuditSearch] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [companyFilter, setCompanyFilter] = useState("all")
  const [actorRoleFilter, setActorRoleFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [apiOnly, setApiOnly] = useState(false)

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

  const actionOptions = Array.from(new Set(auditLogs.map((log) => log.action).filter(Boolean))).sort()
  const companyOptions = Array.from(
    new Map(
      auditLogs
        .filter((log) => log.company_id)
        .map((log) => [log.company_id, log.company_name || log.company_id])
    ).entries()
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1]), "tr"))

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (apiOnly && !String(log.action ?? "").startsWith("api")) return false
    if (actionFilter !== "all" && log.action !== actionFilter) return false
    if (companyFilter !== "all" && log.company_id !== companyFilter) return false
    if (actorRoleFilter !== "all" && log.actor_role !== actorRoleFilter) return false
    if (dateFrom && new Date(log.created_at) < new Date(`${dateFrom}T00:00:00`)) return false
    if (dateTo && new Date(log.created_at) > new Date(`${dateTo}T23:59:59`)) return false
    if (!auditSearch.trim()) return true
    const q = auditSearch.toLowerCase()
    return (
      log.actor_name?.toLowerCase().includes(q) ||
      log.company_name?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q) ||
      log.target_type?.toLowerCase().includes(q) ||
      JSON.stringify(log.metadata ?? {}).toLowerCase().includes(q)
    )
  })

  const clearAuditFilters = () => {
    setAuditSearch("")
    setActionFilter("all")
    setCompanyFilter("all")
    setActorRoleFilter("all")
    setDateFrom("")
    setDateTo("")
    setApiOnly(false)
  }

  const exportAuditCsv = () => {
    const rows = [
      ["Tarih", "Aktor", "Aktor Tipi", "Aksiyon", "Hedef Tipi", "Hedef ID", "Firma", "Detay"],
      ...filteredAuditLogs.map((log) => [
        new Date(log.created_at).toLocaleString("tr-TR"),
        log.actor_name,
        log.actor_role,
        log.action,
        log.target_type,
        log.target_id,
        log.company_name,
        log.metadata ?? {},
      ]),
    ]
    const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n")
    const today = new Date().toISOString().slice(0, 10)
    downloadTextFile(`msgnex-audit-log-${today}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8")
  }

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
        <div className="mb-4 grid gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Input
              placeholder="Aktör, firma, aksiyon veya detay ara..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
          </div>
          <FilterSelect label="Aksiyon" value={actionFilter} onChange={setActionFilter}>
            <option value="all">Tüm aksiyonlar</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Firma" value={companyFilter} onChange={setCompanyFilter}>
            <option value="all">Tüm firmalar</option>
            {companyOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Aktör" value={actorRoleFilter} onChange={setActorRoleFilter}>
            <option value="all">Tüm aktörler</option>
            <option value="admin">Admin</option>
            <option value="customer">Müşteri</option>
            <option value="api">API</option>
          </FilterSelect>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Başlangıç</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Bitiş</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-900"
            />
          </label>
        </div>
        <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={apiOnly}
              onChange={(event) => setApiOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Sadece API olayları
          </label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{filteredAuditLogs.length} kayıt gösteriliyor</span>
            <Button variant="secondary" size="sm" onClick={exportAuditCsv} disabled={filteredAuditLogs.length === 0}>CSV İndir</Button>
            <Button variant="secondary" size="sm" onClick={clearAuditFilters}>Filtreleri Temizle</Button>
          </div>
        </div>
        <Table>
          <THead>
            <Tr>
              <Th>Tarih</Th>
              <Th>Aktör</Th>
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
                <Td className="font-medium">
                  {log.actor_name}
                  {log.actor_role ? <span className="block text-xs font-normal text-gray-400">{log.actor_role}</span> : null}
                </Td>
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
        <p className="mt-2 text-xs text-gray-400">Son 100 operasyon kaydı içinde filtreleme yapılır</p>
      </Card>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-900"
      >
        {children}
      </select>
    </label>
  )
}
