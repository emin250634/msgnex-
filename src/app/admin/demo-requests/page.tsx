"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"

interface DemoRequest {
  id: string
  full_name: string
  company_name: string
  phone: string
  email: string
  monthly_sms_volume: string
  message: string | null
  status: "new" | "contacted" | "approved" | "rejected"
  company_id: string | null
  invitation_id: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  last_email_sent_at: string | null
  last_error: string | null
  created_at: string
}

const labels = { new: "Yeni", contacted: "İletişime Geçildi", approved: "Onaylandı", rejected: "Reddedildi" }
const tones = { new: "info", contacted: "warning", approved: "success", rejected: "danger" } as const

export default function AdminDemoRequestsPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [updating, setUpdating] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<DemoRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  const load = async () => {
    setLoading(true)
    const response = await fetch("/api/admin/demo-requests")
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) toast.error(payload.error || "Demo talepleri yüklenemedi.")
    setRequests(payload.requests ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id: string, status: DemoRequest["status"], rejection_reason?: string) => {
    setUpdating(id)
    try {
      const response = await fetch("/api/admin/demo-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, rejection_reason }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Durum güncellenemedi.")
      setRequests((current) => current.map((item) => item.id === id ? payload.request : item))
      toast.success(payload.message || "Demo talebi güncellendi.")
      if (status === "rejected") {
        setRejecting(null)
        setRejectionReason("")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Durum güncellenemedi.")
      await load()
    } finally {
      setUpdating(null)
    }
  }

  const visible = useMemo(() => filter === "all" ? requests : requests.filter((item) => item.status === filter), [filter, requests])

  return (
    <div className="space-y-6">
      <PageHeader title="Demo Talepleri" description="Kontrollü beta başvurularını değerlendirin ve iletişim sürecini yönetin." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["new", "contacted", "approved", "rejected"] as const).map((status) => (
          <button key={status} onClick={() => setFilter(status)} className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">{labels[status]}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{requests.filter((item) => item.status === status).length}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-slate-950">Başvurular</h2><p className="mt-1 text-sm text-slate-500">{visible.length} kayıt gösteriliyor</p></div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="all">Tüm Durumlar</option>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState title="Demo talebi bulunmuyor" description="Yeni beta başvuruları geldiğinde burada görüntülenecek." />
        ) : (
          <div className="space-y-4">
            {visible.map((request) => (
              <article key={request.id} className="rounded-lg border border-slate-200 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-semibold text-slate-950">{request.company_name}</h3><StatusBadge label={labels[request.status]} tone={tones[request.status]} /></div>
                    <p className="mt-1 text-sm font-medium text-slate-700">{request.full_name}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                      <a href={`tel:${request.phone}`} className="hover:text-blue-700">{request.phone}</a>
                      <a href={`mailto:${request.email}`} className="hover:text-blue-700">{request.email}</a>
                      <span>Aylık: {request.monthly_sms_volume}</span>
                      <span>{new Date(request.created_at).toLocaleString("tr-TR")}</span>
                    </div>
                    {request.message && <p className="mt-4 max-w-3xl rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{request.message}</p>}
                    {request.rejection_reason && <p className="mt-3 text-sm text-red-700"><strong>Red sebebi:</strong> {request.rejection_reason}</p>}
                    {request.last_error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Son işlem hatası:</strong> {request.last_error}</p>}
                    {request.last_email_sent_at && <p className="mt-3 text-xs font-medium text-emerald-700">Son e-posta: {new Date(request.last_email_sent_at).toLocaleString("tr-TR")}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:max-w-[350px] xl:justify-end">
                    {request.company_id && <Link href={`/admin/companies/${request.company_id}`}><Button size="sm" variant="secondary">Firma Detayına Git</Button></Link>}
                    <Button size="sm" variant="secondary" disabled={updating === request.id || request.status === "approved" || request.status === "rejected"} onClick={() => updateStatus(request.id, "contacted")}>İletişime Geçildi</Button>
                    <Button size="sm" disabled={updating === request.id || request.status === "approved" || request.status === "rejected"} onClick={() => updateStatus(request.id, "approved")}>{updating === request.id ? "İşleniyor..." : "Onayla"}</Button>
                    <Button size="sm" variant="danger" disabled={updating === request.id || request.status === "approved" || request.status === "rejected"} onClick={() => { setRejecting(request); setRejectionReason("") }}>Reddet</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-950">Demo talebini reddet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {rejecting.company_name} firmasına profesyonel bir bilgilendirme maili gönderilecek.
            </p>
            <label htmlFor="rejection_reason" className="mt-5 block text-sm font-medium text-slate-700">Red sebebi</label>
            <textarea
              id="rejection_reason"
              rows={4}
              maxLength={1000}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="İsteğe bağlı değerlendirme notu"
              className="mt-1 block w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={updating === rejecting.id} onClick={() => setRejecting(null)}>Vazgeç</Button>
              <Button variant="danger" disabled={updating === rejecting.id} onClick={() => updateStatus(rejecting.id, "rejected", rejectionReason)}>
                {updating === rejecting.id ? "Mail gönderiliyor..." : "Reddet ve Mail Gönder"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
