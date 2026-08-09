"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import type { CompanyAuditLog } from "@/types"

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

export default function CustomerAuditLogsPage() {
  const [logs, setLogs] = useState<CompanyAuditLog[]>([])
  const [plan, setPlan] = useState<{ plan: CompanyPlan; has_audit_log: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [actorRoleFilter, setActorRoleFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [apiOnly, setApiOnly] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const [{ data: planRows }, { data: auditRows, error: auditError }] = await Promise.all([
      supabase.rpc("get_customer_plan"),
      supabase.rpc("list_company_audit_logs"),
    ])

    setPlan(planRows?.[0] ?? null)
    if (auditError) {
      if (!String(auditError.message).includes("Audit log access requires")) {
        setError(auditError.message)
      }
      setLogs([])
    } else {
      setLogs((auditRows ?? []) as CompanyAuditLog[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const actionOptions = Array.from(new Set(logs.map((log) => log.action).filter(Boolean))).sort()
  const filteredLogs = logs.filter((log) => {
    if (apiOnly && !String(log.action ?? "").startsWith("api")) return false
    if (actionFilter !== "all" && log.action !== actionFilter) return false
    if (actorRoleFilter !== "all" && log.actor_role !== actorRoleFilter) return false
    if (dateFrom && new Date(log.created_at) < new Date(`${dateFrom}T00:00:00`)) return false
    if (dateTo && new Date(log.created_at) > new Date(`${dateTo}T23:59:59`)) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      log.actor_name?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q) ||
      log.target_type?.toLowerCase().includes(q) ||
      JSON.stringify(log.metadata ?? {}).toLowerCase().includes(q)
    )
  })

  const clearFilters = () => {
    setSearch("")
    setActionFilter("all")
    setActorRoleFilter("all")
    setDateFrom("")
    setDateTo("")
    setApiOnly(false)
  }

  const exportCsv = () => {
    const rows = [
      ["Tarih", "Aktor", "Aktor Tipi", "Aksiyon", "Hedef Tipi", "Hedef ID", "Detay"],
      ...filteredLogs.map((log) => [
        new Date(log.created_at).toLocaleString("tr-TR"),
        log.actor_name,
        log.actor_role,
        log.action,
        log.target_type,
        log.target_id,
        log.metadata ?? {},
      ]),
    ]
    const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n")
    const today = new Date().toISOString().slice(0, 10)
    downloadTextFile(`msgnex-firma-audit-log-${today}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Logları" description="Firmanızdaki güvenlik ve operasyon olaylarını takip edin." />
        <LoadingState variant="table" rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Logları" description="Firmanızdaki güvenlik ve operasyon olaylarını takip edin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  if (!plan?.has_audit_log) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit Logları"
          description={`Firmanızdaki güvenlik ve operasyon olaylarını takip edin. Mevcut plan: ${plan ? PLAN_LABELS[plan.plan] : "-"}`}
        />
        <Card title="Paket Gereksinimi">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-semibold">Audit log görünürlüğü Profesyonel veya Ajans planında aktiftir.</p>
            <p>Bu ekran API anahtarları, webhook ve kritik ayar işlemlerinin firma içinde denetlenebilmesi için kullanılır.</p>
            <Link href="/plan" className="mt-2 inline-block font-semibold text-amber-950 underline">Planları incele</Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logları"
        description={`Firmanızdaki güvenlik ve operasyon olaylarını takip edin. Mevcut plan: ${PLAN_LABELS[plan.plan]}`}
      />

      <Card title="Filtreler">
        <div className="grid gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Input
              placeholder="Aktör, aksiyon, hedef veya detay ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FilterSelect label="Aksiyon" value={actionFilter} onChange={setActionFilter}>
            <option value="all">Tüm aksiyonlar</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Aktör" value={actorRoleFilter} onChange={setActorRoleFilter}>
            <option value="all">Tüm aktörler</option>
            <option value="customer">Müşteri</option>
            <option value="api">API</option>
            <option value="admin">Admin</option>
          </FilterSelect>
          <DateInput label="Başlangıç" value={dateFrom} onChange={setDateFrom} />
          <DateInput label="Bitiş" value={dateTo} onChange={setDateTo} />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={apiOnly}
              onChange={(event) => setApiOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Sadece API olayları
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">{filteredLogs.length} kayıt gösteriliyor</span>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filteredLogs.length === 0}>CSV İndir</Button>
            <Button variant="secondary" size="sm" onClick={clearFilters}>Filtreleri Temizle</Button>
          </div>
        </div>
      </Card>

      <Card title="Firma Operasyon Kayıtları">
        {filteredLogs.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Tarih</Th>
                <Th>Aktör</Th>
                <Th>Aksiyon</Th>
                <Th>Hedef</Th>
                <Th>Detay</Th>
              </Tr>
            </THead>
            <TBody>
              {filteredLogs.map((log) => (
                <Tr key={log.id}>
                  <Td className="text-sm text-gray-500">{new Date(log.created_at).toLocaleString("tr-TR")}</Td>
                  <Td className="font-medium">
                    {log.actor_name}
                    {log.actor_role ? <span className="block text-xs font-normal text-gray-400">{log.actor_role}</span> : null}
                  </Td>
                  <Td><StatusBadge label={log.action} tone={log.action.startsWith("api.rate") ? "warning" : "info"} /></Td>
                  <Td className="text-sm text-gray-700">
                    {log.target_type}
                    {log.target_id ? <span className="block font-mono text-xs text-gray-400">{log.target_id.slice(0, 8)}...</span> : null}
                  </Td>
                  <Td className="max-w-sm truncate font-mono text-xs text-gray-500" title={JSON.stringify(log.metadata ?? {})}>
                    {JSON.stringify(log.metadata ?? {})}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">LOG</span>}
            title="Audit kaydı bulunamadı"
            description="Seçili filtrelere uygun firma operasyon kaydı yok."
            action={<Button variant="secondary" onClick={clearFilters}>Filtreleri Temizle</Button>}
          />
        )}
        <p className="mt-2 text-xs text-gray-400">Son 200 firma operasyon kaydı içinde filtreleme yapılır</p>
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

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-900"
      />
    </label>
  )
}
