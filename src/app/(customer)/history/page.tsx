"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import type { SmsMessage } from "@/types"

const PAGE_SIZE = 20

type MessageStatusFilter = "all" | SmsMessage["status"]
type FinalFilter = "all" | "final" | "pending"
type DeliveryFilter = "all" | "delivered" | "failed" | "not_resolved"

function messageStatusLabel(status: SmsMessage["status"]) {
  if (status === "sent") return "Gönderildi"
  if (status === "delivered") return "Teslim Edildi"
  if (status === "failed") return "Hata"
  return "Bekliyor"
}

function messageStatusTone(status: SmsMessage["status"]) {
  if (status === "sent" || status === "delivered") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function shortId(value?: string | null) {
  if (!value) return "-"
  return value.length > 20 ? `${value.slice(0, 9)}...${value.slice(-7)}` : value
}

function dateOnly(value?: string | null) {
  if (!value) return ""
  return value.slice(0, 10)
}

function matchesDateRange(value: string, from: string, to: string) {
  const date = dateOnly(value)
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function matchesDelivery(message: SmsMessage, filter: DeliveryFilter) {
  if (filter === "all") return true
  if (filter === "delivered") return Boolean(message.delivered_at) || message.status === "delivered"
  if (filter === "failed") return Boolean(message.failed_at) || message.status === "failed"
  if (filter === "not_resolved") return !message.delivered_at && !message.failed_at
  return true
}

export default function HistoryPage() {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<MessageStatusFilter>("all")
  const [providerFilter, setProviderFilter] = useState("all")
  const [finalFilter, setFinalFilter] = useState<FinalFilter>("all")
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all")
  const [campaignFilter, setCampaignFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("sms_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        setMessages(data ?? [])
        setLoading(false)
      })
  }, [])

  const providerOptions = useMemo(() => Array.from(new Set(messages.map((message) => message.provider_name).filter(Boolean))) as string[], [messages])
  const campaignOptions = useMemo(() => Array.from(new Set(messages.map((message) => message.campaign_id).filter(Boolean))) as string[], [messages])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return messages.filter((message) => {
      const searchable = [
        message.recipient,
        message.message,
        message.status,
        message.provider_name,
        message.provider_status_code,
        message.provider_status_text,
        message.provider_message_id,
        message.campaign_id,
      ].filter(Boolean).join(" ").toLowerCase()

      const matchesSearch = !q || searchable.includes(q)
      const matchesStatus = statusFilter === "all" || message.status === statusFilter
      const matchesProvider = providerFilter === "all" || message.provider_name === providerFilter
      const matchesFinal = finalFilter === "all" || (finalFilter === "final" ? message.is_final : !message.is_final)
      const matchesCampaign = campaignFilter === "all" || (campaignFilter === "none" ? !message.campaign_id : message.campaign_id === campaignFilter)

      return matchesSearch &&
        matchesStatus &&
        matchesProvider &&
        matchesFinal &&
        matchesCampaign &&
        matchesDelivery(message, deliveryFilter) &&
        matchesDateRange(message.created_at, dateFrom, dateTo)
    })
  }, [campaignFilter, dateFrom, dateTo, deliveryFilter, finalFilter, messages, providerFilter, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const hasActiveFilters = Boolean(search || statusFilter !== "all" || providerFilter !== "all" || finalFilter !== "all" || deliveryFilter !== "all" || campaignFilter !== "all" || dateFrom || dateTo)

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setProviderFilter("all")
    setFinalFilter("all")
    setDeliveryFilter("all")
    setCampaignFilter("all")
    setDateFrom("")
    setDateTo("")
  }

  useEffect(() => { setPage(1) }, [search, statusFilter, providerFilter, finalFilter, deliveryFilter, campaignFilter, dateFrom, dateTo])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Gönderim Geçmişi" description="Numara bazlı SMS durumlarını, provider yanıtlarını ve DLR zamanlarını izleyin." />
        <LoadingState variant="table" rows={7} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Gönderim Geçmişi" description="Numara bazlı SMS durumlarını, provider yanıtlarını ve DLR zamanlarını izleyin." />
        <ErrorState description={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gönderim Geçmişi"
        description="Numara bazlı SMS durumlarını, provider yanıtlarını ve DLR zamanlarını izleyin."
      />

      <Card title="SMS Geçmişi">
        <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              placeholder="Telefon, mesaj, provider, provider id veya kampanya id ile ara..."
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <Select value={statusFilter} onChange={(value) => setStatusFilter(value as MessageStatusFilter)}>
                <option value="all">Tüm durumlar</option>
                <option value="pending">Bekliyor</option>
                <option value="sent">Gönderildi</option>
                <option value="delivered">Teslim edildi</option>
                <option value="failed">Hata</option>
              </Select>
              <Select value={providerFilter} onChange={setProviderFilter}>
                <option value="all">Tüm providerlar</option>
                {providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
              </Select>
              <Select value={finalFilter} onChange={(value) => setFinalFilter(value as FinalFilter)}>
                <option value="all">Final / bekleyen</option>
                <option value="final">Final</option>
                <option value="pending">Bekleyen</option>
              </Select>
              <Select value={deliveryFilter} onChange={(value) => setDeliveryFilter(value as DeliveryFilter)}>
                <option value="all">Teslim / hata</option>
                <option value="delivered">Teslim edildi</option>
                <option value="failed">Başarısız</option>
                <option value="not_resolved">Sonuçlanmadı</option>
              </Select>
              <Select value={campaignFilter} onChange={setCampaignFilter}>
                <option value="all">Tüm kampanyalar</option>
                <option value="none">Kampanyasız</option>
                {campaignOptions.map((campaignId) => <option key={campaignId} value={campaignId}>{campaignId.slice(0, 8)}...</option>)}
              </Select>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <StatusBadge label={`${filtered.length} sonuç`} tone="info" />
            <span>Mevcut kayıtlar içinde filtreleniyor.</span>
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          {paged.length > 0 ? paged.map((message) => (
            <div key={message.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-gray-950">{message.recipient}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(message.created_at)}</p>
                </div>
                <StatusBadge label={messageStatusLabel(message.status)} tone={messageStatusTone(message.status)} />
              </div>
              <p className="mt-3 max-h-16 overflow-hidden text-sm leading-6 text-gray-700">{message.message}</p>
              <div className="mt-3 grid gap-2 text-xs text-gray-600">
                <div className="flex justify-between gap-3"><span>Provider</span><span className="font-semibold text-gray-950">{message.provider_name || "-"}</span></div>
                <div className="flex justify-between gap-3"><span>Provider ID</span><span className="font-mono font-semibold text-gray-950">{shortId(message.provider_message_id)}</span></div>
                <div className="flex justify-between gap-3"><span>Final</span><span className="font-semibold text-gray-950">{message.is_final ? "Final" : "Bekliyor"}</span></div>
                <div className="flex justify-between gap-3"><span>DLR</span><span className="font-semibold text-gray-950">{formatDate(message.last_dlr_checked_at)}</span></div>
              </div>
            </div>
          )) : (
            <EmptyState
              icon={<span className="text-2xl">GD</span>}
              title={hasActiveFilters ? "Filtreye uygun gönderim yok" : "Henüz gönderim yok"}
              description={hasActiveFilters ? "Arama veya filtreleri değiştirerek tekrar deneyin." : "İlk SMS gönderiminiz tamamlandığında kayıtlar burada görünecek."}
              action={<Button variant="secondary" onClick={hasActiveFilters ? clearFilters : () => window.location.reload()}>{hasActiveFilters ? "Filtreleri Temizle" : "Yenile"}</Button>}
            />
          )}
        </div>

        <div className="hidden lg:block">
        <Table>
          <THead>
            <Tr>
              <Th>Alıcı</Th>
              <Th>Mesaj</Th>
              <Th>Durum</Th>
              <Th>Provider</Th>
              <Th>Provider Yanıtı</Th>
              <Th>Final</Th>
              <Th>Teslim/Hata</Th>
              <Th>DLR Son Kontrol</Th>
              <Th>Provider Birimi</Th>
            </Tr>
          </THead>
          <TBody>
            {paged.map((message) => (
              <Tr key={message.id}>
                <Td className="font-medium">{message.recipient}</Td>
                <Td className="max-w-xs truncate" title={message.message}>{message.message}</Td>
                <Td>
                  <StatusBadge label={messageStatusLabel(message.status)} tone={messageStatusTone(message.status)} />
                </Td>
                <Td>
                  <div className="text-sm font-medium text-gray-900">{message.provider_name || "-"}</div>
                  <div className="font-mono text-xs text-gray-500" title={message.provider_message_id || undefined}>
                    {shortId(message.provider_message_id)}
                  </div>
                </Td>
                <Td>
                  <div className="font-mono text-xs text-gray-700">{message.provider_status_code || "-"}</div>
                  <div className="mt-1 max-w-[220px] truncate text-xs text-gray-500" title={message.provider_status_text || undefined}>
                    {message.provider_status_text || "-"}
                  </div>
                </Td>
                <Td>
                  <StatusBadge
                    label={message.is_final ? "Final" : "Bekliyor"}
                    tone={message.is_final ? "success" : "warning"}
                  />
                </Td>
                <Td className="text-sm text-gray-500">
                  {message.delivered_at ? formatDate(message.delivered_at) : formatDate(message.failed_at)}
                </Td>
                <Td className="text-sm text-gray-500">{formatDate(message.last_dlr_checked_at)}</Td>
                <Td>{message.credits_cost}</Td>
              </Tr>
            ))}
            {paged.length === 0 && (
              <Tr>
                <Td colSpan={9}>
                  <EmptyState
                    icon={<span className="text-2xl">GD</span>}
                    title={hasActiveFilters ? "Filtreye uygun gönderim yok" : "Henüz gönderim yok"}
                    description={hasActiveFilters ? "Arama veya filtreleri değiştirerek tekrar deneyin." : "İlk SMS gönderiminiz tamamlandığında kayıtlar burada görünecek."}
                    action={<Button variant="secondary" onClick={hasActiveFilters ? clearFilters : () => window.location.reload()}>{hasActiveFilters ? "Filtreleri Temizle" : "Yenile"}</Button>}
                  />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">
              Toplam {filtered.length} kayıt (sayfa {page}/{totalPages})
            </p>
            <div className="flex gap-1">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Geri</Button>
              <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>İleri</Button>
            </div>
          </div>
        )}
      </Card>
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
