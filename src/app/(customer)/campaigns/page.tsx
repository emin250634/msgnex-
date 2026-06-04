"use client"

import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { calculateSmsSegments } from "@/lib/sms-segments"
import { createClient } from "@/lib/supabase/client"
import type { Group, SmsCampaign } from "@/types"

type CampaignStatusFilter = "all" | SmsCampaign["status"]
type DlrFilter = "all" | "awaiting" | "checked" | "completed" | "none"

const statusLabels: Record<SmsCampaign["status"], string> = {
  draft: "Taslak",
  queued: "Kuyrukta",
  scheduled: "Planlandı",
  sending: "Gönderiliyor",
  completed: "Tamamlandı",
  failed: "Hata",
  cancelled: "İptal Edildi",
  review_required: "İnceleme Gerekli",
}

const statusClasses: Record<SmsCampaign["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  sending: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
  review_required: "bg-orange-100 text-orange-700",
}

function providerStatusLabel(status?: string | null) {
  if (!status) return "Yok"
  const labels: Record<string, string> = {
    awaiting_dlr: "DLR bekleniyor",
    delivered: "Teslim edildi",
    partially_delivered: "Kısmi teslim",
    partially_submitted: "Kısmi gönderim",
    failed: "Provider hata",
    delivery_after_refund_review: "İnceleme",
  }
  return labels[status] || status
}

function providerStatusTone(status?: string | null) {
  if (!status) return "neutral" as const
  if (status === "delivered") return "success" as const
  if (status === "failed") return "danger" as const
  if (status.includes("review") || status.includes("partial")) return "warning" as const
  return "info" as const
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function shortId(value?: string | null) {
  if (!value) return "-"
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value
}

function dateOnly(value?: string | null) {
  if (!value) return ""
  return value.slice(0, 10)
}

function estimatedCampaignCredits(campaign: SmsCampaign) {
  return campaign.total_recipients * calculateSmsSegments(campaign.message).segments
}

function matchesDateRange(value: string, from: string, to: string) {
  const date = dateOnly(value)
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function matchesDlr(campaign: SmsCampaign, filter: DlrFilter) {
  if (filter === "all") return true
  if (filter === "awaiting") return campaign.provider_status === "awaiting_dlr"
  if (filter === "checked") return Boolean(campaign.dlr_last_checked_at)
  if (filter === "completed") return Boolean(campaign.dlr_completed_at)
  if (filter === "none") return !campaign.dlr_last_checked_at && !campaign.dlr_completed_at
  return true
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelTarget, setCancelTarget] = useState<SmsCampaign | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all")
  const [providerFilter, setProviderFilter] = useState("all")
  const [dlrFilter, setDlrFilter] = useState<DlrFilter>("all")
  const [groupFilter, setGroupFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const [{ data: campaignRows, error: campaignError }, { data: groupRows, error: groupError }] = await Promise.all([
      supabase
        .from("sms_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("groups")
        .select("*")
        .order("name", { ascending: true }),
    ])
    if (campaignError || groupError) {
      setError(campaignError?.message || groupError?.message || "Kampanya verileri yüklenemedi.")
    }
    setCampaigns(campaignRows ?? [])
    setGroups(groupRows ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const providerOptions = useMemo(() => Array.from(new Set(campaigns.map((campaign) => campaign.provider_name).filter(Boolean))) as string[], [campaigns])

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase()

    return campaigns.filter((campaign) => {
      const group = campaign.group_id ? groupMap.get(campaign.group_id) : null
      const searchable = [
        campaign.name,
        campaign.message,
        campaign.provider_name,
        campaign.provider_status,
        campaign.provider_status_text,
        group?.name,
      ].filter(Boolean).join(" ").toLowerCase()

      const matchesSearch = !q || searchable.includes(q)
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter
      const matchesProvider = providerFilter === "all" || campaign.provider_name === providerFilter
      const matchesGroup = groupFilter === "all" || (groupFilter === "none" ? !campaign.group_id : campaign.group_id === groupFilter)

      return matchesSearch &&
        matchesStatus &&
        matchesProvider &&
        matchesGroup &&
        matchesDlr(campaign, dlrFilter) &&
        matchesDateRange(campaign.created_at, dateFrom, dateTo)
    })
  }, [campaigns, dateFrom, dateTo, dlrFilter, groupFilter, groupMap, providerFilter, search, statusFilter])

  const hasActiveFilters = Boolean(search || statusFilter !== "all" || providerFilter !== "all" || dlrFilter !== "all" || groupFilter !== "all" || dateFrom || dateTo)

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setProviderFilter("all")
    setDlrFilter("all")
    setGroupFilter("all")
    setDateFrom("")
    setDateTo("")
  }

  const handleCancel = async () => {
    if (!cancelTarget) return

    setCancelling(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc("cancel_queued_sms_campaign", {
      p_campaign_id: cancelTarget.id,
    })
    setCancelling(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`${data.refund} kredi iade edildi`)
    setCancelTarget(null)
    load()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kampanyalar" description="Toplu SMS gönderimlerinin operasyon ve provider durumlarını takip edin." />
        <LoadingState variant="table" rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kampanyalar" description="Toplu SMS gönderimlerinin operasyon ve provider durumlarını takip edin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kampanyalar"
        description="Toplu SMS gönderimlerinin operasyon ve provider durumlarını takip edin."
        actions={<Button variant="secondary" onClick={load}>Yenile</Button>}
      />

      <Card title="Son Kampanyalar">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Kuyruktaki kampanyaları iptal edebilirsiniz. Gönderilmeye başlanmış kampanyalar çift SMS riskini önlemek için otomatik tekrar gönderilmez.
        </div>

        <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              placeholder="Kampanya adı, mesaj, provider veya segment ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
              {showFilters ? "Filtreleri Gizle" : "Filtreler"}
            </Button>
            <Button variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
              Filtreleri Temizle
            </Button>
          </div>

          {showFilters && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <Select value={statusFilter} onChange={(value) => setStatusFilter(value as CampaignStatusFilter)}>
                <option value="all">Tüm durumlar</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Select value={providerFilter} onChange={setProviderFilter}>
                <option value="all">Tüm providerlar</option>
                {providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
              </Select>
              <Select value={dlrFilter} onChange={(value) => setDlrFilter(value as DlrFilter)}>
                <option value="all">Tüm DLR</option>
                <option value="awaiting">DLR bekleyen</option>
                <option value="checked">DLR kontrol edildi</option>
                <option value="completed">DLR tamamlandı</option>
                <option value="none">DLR yok</option>
              </Select>
              <Select value={groupFilter} onChange={setGroupFilter}>
                <option value="all">Tüm segmentler</option>
                <option value="none">Segmentsiz</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </Select>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <StatusBadge label={`${filteredCampaigns.length} sonuç`} tone="info" />
            <span>Son 100 kampanya içinde filtreleniyor.</span>
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          {filteredCampaigns.length > 0 ? filteredCampaigns.map((campaign) => {
            const group = campaign.group_id ? groupMap.get(campaign.group_id) : null

            return (
              <div key={campaign.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">{campaign.name || campaign.message}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatDate(campaign.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClasses[campaign.status]}`}>
                    {statusLabels[campaign.status]}
                  </span>
                </div>
                <p className="mt-3 max-h-16 overflow-hidden text-sm leading-6 text-gray-700">{campaign.message}</p>
                <div className="mt-3 grid gap-2 text-xs text-gray-600">
                  <div className="flex justify-between gap-3"><span>Alıcı</span><span className="font-semibold text-gray-950">{campaign.total_recipients}</span></div>
                  <div className="flex justify-between gap-3"><span>Segment</span><span className="font-semibold text-gray-950">{group?.name || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span>Provider</span><span className="font-semibold text-gray-950">{campaign.provider_name || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span>DLR</span><span className="font-semibold text-gray-950">{formatDate(campaign.dlr_last_checked_at)}</span></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge label={providerStatusLabel(campaign.provider_status)} tone={providerStatusTone(campaign.provider_status)} />
                  <StatusBadge label={`${campaign.provider_pending_count ?? 0} bekleyen`} tone="warning" />
                </div>
                {campaign.status === "queued" && (
                  <Button variant="danger" size="sm" className="mt-4 w-full" onClick={() => setCancelTarget(campaign)}>
                    İptal Et
                  </Button>
                )}
              </div>
            )
          }) : (
            <EmptyState
              icon={<span className="text-2xl">KP</span>}
              title={hasActiveFilters ? "Filtreye uygun kampanya yok" : "Henüz kampanya yok"}
              description={hasActiveFilters ? "Arama veya filtreleri değiştirerek tekrar deneyin." : "İlk SMS kampanyanızı oluşturduğunuzda burada listelenecek."}
              action={<Button variant="secondary" onClick={hasActiveFilters ? clearFilters : load}>{hasActiveFilters ? "Filtreleri Temizle" : "Yenile"}</Button>}
            />
          )}
        </div>

        <div className="hidden lg:block">
        <Table>
          <THead>
            <Tr>
              <Th>Tarih</Th>
              <Th>Mesaj</Th>
              <Th>Alıcı</Th>
              <Th>Segment</Th>
              <Th>Durum</Th>
              <Th>Provider</Th>
              <Th>Provider Durumu</Th>
              <Th>Provider Sonuçları</Th>
              <Th>DLR Son Kontrol</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {filteredCampaigns.map((campaign) => {
              const group = campaign.group_id ? groupMap.get(campaign.group_id) : null

              return (
                <Tr key={campaign.id}>
                  <Td className="text-sm text-gray-500">{formatDate(campaign.created_at)}</Td>
                  <Td className="max-w-sm truncate" title={campaign.message}>{campaign.message}</Td>
                  <Td>
                    <div className="text-sm font-medium text-gray-900">{campaign.total_recipients}</div>
                    {campaign.skipped_recipients > 0 && (
                      <div className="text-xs text-amber-700">{campaign.skipped_recipients} atlandı</div>
                    )}
                  </Td>
                  <Td>{group ? <StatusBadge label={group.name} tone="info" /> : <StatusBadge label="-" tone="neutral" />}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClasses[campaign.status]}`}>
                      {statusLabels[campaign.status]}
                    </span>
                  </Td>
                  <Td>
                    <div className="text-sm font-medium text-gray-900">{campaign.provider_name || "-"}</div>
                    <div className="font-mono text-xs text-gray-500" title={campaign.provider_bulk_id || undefined}>
                      {shortId(campaign.provider_bulk_id)}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge
                      label={providerStatusLabel(campaign.provider_status)}
                      tone={providerStatusTone(campaign.provider_status)}
                    />
                    {campaign.provider_status_text && (
                      <div className="mt-1 max-w-[180px] truncate text-xs text-gray-500" title={campaign.provider_status_text}>
                        {campaign.provider_status_text}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                        {campaign.provider_success_count ?? campaign.success_count} başarılı
                      </span>
                      <span className="rounded-full bg-red-50 px-2 py-1 font-medium text-red-700">
                        {campaign.provider_failed_count ?? campaign.fail_count} hatalı
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
                        {campaign.provider_pending_count ?? 0} bekleyen
                      </span>
                    </div>
                  </Td>
                  <Td className="text-sm text-gray-500">{formatDate(campaign.dlr_last_checked_at)}</Td>
                  <Td>
                    {campaign.status === "queued" && (
                      <Button variant="danger" size="sm" onClick={() => setCancelTarget(campaign)}>
                        İptal Et
                      </Button>
                    )}
                  </Td>
                </Tr>
              )
            })}
            {filteredCampaigns.length === 0 && (
              <Tr>
                <Td colSpan={10}>
                  <EmptyState
                    icon={<span className="text-2xl">KP</span>}
                    title={hasActiveFilters ? "Filtreye uygun kampanya yok" : "Henüz kampanya yok"}
                    description={hasActiveFilters ? "Arama veya filtreleri değiştirerek tekrar deneyin." : "İlk SMS kampanyanızı oluşturduğunuzda burada listelenecek."}
                    action={<Button variant="secondary" onClick={hasActiveFilters ? clearFilters : load}>{hasActiveFilters ? "Filtreleri Temizle" : "Yenile"}</Button>}
                  />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
        </div>
      </Card>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
          <Card title="Kampanya İptal Onayı" className="w-full max-w-xl shadow-2xl">
            <div className="space-y-5">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="text-lg font-semibold text-red-950">Bu kampanya iptal edilecek</p>
                <p className="mt-1">İptal işlemi yalnızca kuyruktaki kampanyalar için uygulanır. Ayrılan kredi bakiyeye iade edilir.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CancelMetric label="Etkilenecek kişi" value={`${cancelTarget.total_recipients} kişi`} />
                <CancelMetric label="Atlanan kişi" value={`${cancelTarget.skipped_recipients ?? 0} kişi`} />
                <CancelMetric label="Mesaj parçası" value={`${calculateSmsSegments(cancelTarget.message).segments} parça`} />
                <CancelMetric label="Kullanılacak / ayrılan kredi" value={`${estimatedCampaignCredits(cancelTarget)} kredi`} />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">Mesaj</p>
                <p className="mt-2 max-h-24 overflow-hidden text-sm leading-6 text-gray-700">{cancelTarget.message}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="danger" onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? "İptal ediliyor..." : "Evet, Kampanyayı İptal Et"}
                </Button>
                <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>
                  Vazgeç
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
      {children}
    </select>
  )
}

function CancelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-gray-950">{value}</p>
    </div>
  )
}
