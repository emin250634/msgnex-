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
  has_sms_provider: "yes" | "no" | "planning" | null
  sms_provider_name: string | null
  message: string | null
  status: "new" | "contacted" | "approved" | "rejected"
  company_id: string | null
  invitation_id: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  sales_note: string | null
  recommended_provider: string | null
  next_action: string | null
  follow_up_at: string | null
  last_email_sent_at: string | null
  last_error: string | null
  created_at: string
}

const labels = { new: "Yeni", contacted: "İletişime Geçildi", approved: "Onaylandı", rejected: "Reddedildi" }
const tones = { new: "info", contacted: "warning", approved: "success", rejected: "danger" } as const
const providerLabels = { yes: "Mevcut sağlayıcı var", no: "Sağlayıcı yok", planning: "Teklif aşamasında" }

export default function AdminDemoRequestsPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [updating, setUpdating] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<DemoRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [editingSales, setEditingSales] = useState<DemoRequest | null>(null)
  const [salesDraft, setSalesDraft] = useState({ sales_note: "", recommended_provider: "", next_action: "", follow_up_at: "" })

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

  const openSalesEditor = (request: DemoRequest) => {
    setEditingSales(request)
    setSalesDraft({
      sales_note: request.sales_note || "",
      recommended_provider: request.recommended_provider || "",
      next_action: request.next_action || "",
      follow_up_at: request.follow_up_at ? new Date(request.follow_up_at).toISOString().slice(0, 16) : "",
    })
  }

  const saveSalesFollowUp = async () => {
    if (!editingSales) return
    setUpdating(editingSales.id)
    try {
      const response = await fetch("/api/admin/demo-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSales.id,
          action: "sales_update",
          sales_note: salesDraft.sales_note,
          recommended_provider: salesDraft.recommended_provider,
          next_action: salesDraft.next_action,
          follow_up_at: salesDraft.follow_up_at ? new Date(salesDraft.follow_up_at).toISOString() : null,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Satış takip notu kaydedilemedi.")
      setRequests((current) => current.map((item) => item.id === editingSales.id ? payload.request : item))
      setEditingSales(null)
      toast.success(payload.message || "Satış takip notu kaydedildi.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satış takip notu kaydedilemedi.")
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
                      {request.has_sms_provider && <span>Sağlayıcı: {providerLabels[request.has_sms_provider]}{request.sms_provider_name ? ` / ${request.sms_provider_name}` : ""}</span>}
                      <span>{new Date(request.created_at).toLocaleString("tr-TR")}</span>
                    </div>
                    {request.message && <p className="mt-4 max-w-3xl rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{request.message}</p>}
                    {(request.sales_note || request.recommended_provider || request.next_action || request.follow_up_at) && (
                      <div className="mt-4 grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950 md:grid-cols-2">
                        {request.recommended_provider && <p><strong>Önerilen sağlayıcı:</strong> {request.recommended_provider}</p>}
                        {request.next_action && <p><strong>Sonraki aksiyon:</strong> {request.next_action}</p>}
                        {request.follow_up_at && <p><strong>Takip tarihi:</strong> {new Date(request.follow_up_at).toLocaleString("tr-TR")}</p>}
                        {request.sales_note && <p className="md:col-span-2"><strong>Satış notu:</strong> {request.sales_note}</p>}
                      </div>
                    )}
                    {request.rejection_reason && <p className="mt-3 text-sm text-red-700"><strong>Red sebebi:</strong> {request.rejection_reason}</p>}
                    {request.last_error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Son işlem hatası:</strong> {request.last_error}</p>}
                    {request.last_email_sent_at && <p className="mt-3 text-xs font-medium text-emerald-700">Son e-posta: {new Date(request.last_email_sent_at).toLocaleString("tr-TR")}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:max-w-[350px] xl:justify-end">
                    {request.company_id && <Link href={`/admin/companies/${request.company_id}`}><Button size="sm" variant="secondary">Firma Detayına Git</Button></Link>}
                    <Button size="sm" variant="secondary" disabled={updating === request.id} onClick={() => openSalesEditor(request)}>Takip Notu</Button>
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

      {editingSales && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-950">Satış takip notu</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {editingSales.company_name} için görüşme notu, önerilen sağlayıcı ve sonraki aksiyonu kaydedin.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="recommended_provider" className="mb-1 block text-sm font-medium text-slate-700">Önerilen sağlayıcı</label>
                <input
                  id="recommended_provider"
                  maxLength={120}
                  value={salesDraft.recommended_provider}
                  onChange={(event) => setSalesDraft((current) => ({ ...current, recommended_provider: event.target.value }))}
                  placeholder="Örn. Netgsm, İleti Merkezi"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="follow_up_at" className="mb-1 block text-sm font-medium text-slate-700">Tekrar aranacak tarih</label>
                <input
                  id="follow_up_at"
                  type="datetime-local"
                  value={salesDraft.follow_up_at}
                  onChange={(event) => setSalesDraft((current) => ({ ...current, follow_up_at: event.target.value }))}
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="next_action" className="mb-1 block text-sm font-medium text-slate-700">Sonraki aksiyon</label>
                <input
                  id="next_action"
                  maxLength={500}
                  value={salesDraft.next_action}
                  onChange={(event) => setSalesDraft((current) => ({ ...current, next_action: event.target.value }))}
                  placeholder="Örn. Fiyat seçenekleri paylaşılacak"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="sales_note" className="mb-1 block text-sm font-medium text-slate-700">Satış notu</label>
                <textarea
                  id="sales_note"
                  rows={5}
                  maxLength={2000}
                  value={salesDraft.sales_note}
                  onChange={(event) => setSalesDraft((current) => ({ ...current, sales_note: event.target.value }))}
                  placeholder="Görüşme notlarını yazın."
                  className="block w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={updating === editingSales.id} onClick={() => setEditingSales(null)}>Vazgeç</Button>
              <Button disabled={updating === editingSales.id} onClick={saveSalesFollowUp}>
                {updating === editingSales.id ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
