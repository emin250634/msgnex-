"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"

type PlanId = "starter" | "professional" | "agency"
type RequestStatus = "new" | "contacted" | "closed"

interface PlanUpgradeRequest {
  id: string
  company_id: string
  company_name: string
  requested_plan: PlanId
  current_plan: PlanId | null
  message: string | null
  status: RequestStatus
  admin_note: string | null
  reviewed_at: string | null
  created_at: string
}

const statusLabels: Record<RequestStatus, string> = {
  new: "Yeni",
  contacted: "İletişime Geçildi",
  closed: "Kapatıldı",
}

const statusTones: Record<RequestStatus, "info" | "warning" | "success"> = {
  new: "info",
  contacted: "warning",
  closed: "success",
}

const planLabels: Record<PlanId, string> = {
  starter: "Başlangıç",
  professional: "Profesyonel",
  agency: "Ajans / Kurumsal",
}

export default function AdminPlanRequestsPage() {
  const [requests, setRequests] = useState<PlanUpgradeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | RequestStatus>("all")
  const [updating, setUpdating] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const response = await fetch("/api/admin/plan-upgrade-requests")
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) toast.error(payload.error || "Plan talepleri yüklenemedi.")
    setRequests(payload.requests ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id: string, status: RequestStatus) => {
    setUpdating(id)
    try {
      const response = await fetch("/api/admin/plan-upgrade-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Plan talebi güncellenemedi.")
      setRequests((current) => current.map((item) => item.id === id ? { ...item, ...payload.request } : item))
      toast.success(payload.message || "Plan talebi güncellendi.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Plan talebi güncellenemedi.")
      await load()
    } finally {
      setUpdating(null)
    }
  }

  const visible = useMemo(() => filter === "all" ? requests : requests.filter((item) => item.status === filter), [filter, requests])

  return (
    <div className="space-y-6">
      <PageHeader title="Plan Talepleri" description="Müşterilerden gelen yazılım paketi yükseltme ve görüşme taleplerini takip edin." />

      <div className="grid gap-4 sm:grid-cols-3">
        {(["new", "contacted", "closed"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <p className="text-sm font-medium text-slate-500">{statusLabels[status]}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{requests.filter((item) => item.status === status).length}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Talepler</h2>
            <p className="mt-1 text-sm text-slate-500">{visible.length} kayıt gösteriliyor</p>
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value as "all" | RequestStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="all">Tüm Durumlar</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState title="Plan talebi bulunmuyor" description="Müşteriler paket görüşmesi talep ettiğinde burada görüntülenecek." />
        ) : (
          <div className="space-y-4">
            {visible.map((request) => (
              <article key={request.id} className="rounded-lg border border-slate-200 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-slate-950">{request.company_name}</h3>
                      <StatusBadge label={statusLabels[request.status]} tone={statusTones[request.status]} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                      <span>Talep: {planLabels[request.requested_plan]}</span>
                      {request.current_plan && <span>Mevcut: {planLabels[request.current_plan]}</span>}
                      <span>{new Date(request.created_at).toLocaleString("tr-TR")}</span>
                      {request.reviewed_at && <span>Son işlem: {new Date(request.reviewed_at).toLocaleString("tr-TR")}</span>}
                    </div>
                    {request.message && <p className="mt-4 max-w-3xl rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{request.message}</p>}
                    {request.admin_note && <p className="mt-3 text-sm text-slate-600"><strong>Admin notu:</strong> {request.admin_note}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:max-w-[360px] xl:justify-end">
                    <Link href={`/admin/companies/${request.company_id}`}><Button size="sm" variant="secondary">Firma Detayına Git</Button></Link>
                    <Button size="sm" variant="secondary" disabled={updating === request.id || request.status === "closed"} onClick={() => updateStatus(request.id, "contacted")}>İletişime Geçildi</Button>
                    <Button size="sm" disabled={updating === request.id || request.status === "closed"} onClick={() => updateStatus(request.id, "closed")}>
                      {updating === request.id ? "İşleniyor..." : "Kapat"}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
