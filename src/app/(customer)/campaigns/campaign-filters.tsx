"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import type { Group } from "@/types"
import type { CampaignStatusFilter, DlrFilter } from "./campaign-utils"
import { statusLabels } from "./campaign-utils"
import { Select, SummaryBox } from "./campaign-detail-components"

type CampaignFiltersSummary = {
  totalRecipients: number
  skippedRecipients: number
  success: number
  failed: number
  pending: number
  failureRate: number
}

type CampaignFiltersProps = {
  search: string
  statusFilter: CampaignStatusFilter
  providerFilter: string
  dlrFilter: DlrFilter
  groupFilter: string
  dateFrom: string
  dateTo: string
  showFilters: boolean
  hasActiveFilters: boolean
  resultCount: number
  providerOptions: string[]
  groups: Group[]
  summary: CampaignFiltersSummary
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: CampaignStatusFilter) => void
  onProviderFilterChange: (value: string) => void
  onDlrFilterChange: (value: DlrFilter) => void
  onGroupFilterChange: (value: string) => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onToggleFilters: () => void
  onClearFilters: () => void
  onApplyDatePreset: (preset: "today" | "last7" | "last30" | "month") => void
}

export function CampaignFilters({
  search,
  statusFilter,
  providerFilter,
  dlrFilter,
  groupFilter,
  dateFrom,
  dateTo,
  showFilters,
  hasActiveFilters,
  resultCount,
  providerOptions,
  groups,
  summary,
  onSearchChange,
  onStatusFilterChange,
  onProviderFilterChange,
  onDlrFilterChange,
  onGroupFilterChange,
  onDateFromChange,
  onDateToChange,
  onToggleFilters,
  onClearFilters,
  onApplyDatePreset,
}: CampaignFiltersProps) {
  return (
    <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input
          placeholder="Kampanya adı, mesaj, provider veya segment ara..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Button variant="secondary" onClick={onToggleFilters}>
          {showFilters ? "Filtreleri Gizle" : "Filtreler"}
        </Button>
        <Button variant="secondary" onClick={onClearFilters} disabled={!hasActiveFilters}>
          Filtreleri Temizle
        </Button>
      </div>

      {showFilters && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onApplyDatePreset("today")}>Bugün</Button>
            <Button variant="secondary" size="sm" onClick={() => onApplyDatePreset("last7")}>Son 7 Gün</Button>
            <Button variant="secondary" size="sm" onClick={() => onApplyDatePreset("last30")}>Son 30 Gün</Button>
            <Button variant="secondary" size="sm" onClick={() => onApplyDatePreset("month")}>Bu Ay</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Select value={statusFilter} onChange={(value) => onStatusFilterChange(value as CampaignStatusFilter)}>
              <option value="all">Tüm durumlar</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select value={providerFilter} onChange={onProviderFilterChange}>
              <option value="all">Tüm providerlar</option>
              {providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </Select>
            <Select value={dlrFilter} onChange={(value) => onDlrFilterChange(value as DlrFilter)}>
              <option value="all">Tüm DLR</option>
              <option value="awaiting">DLR bekleyen</option>
              <option value="checked">DLR kontrol edildi</option>
              <option value="completed">DLR tamamlandı</option>
              <option value="none">DLR yok</option>
            </Select>
            <Select value={groupFilter} onChange={onGroupFilterChange}>
              <option value="all">Tüm segmentler</option>
              <option value="none">Segmentsiz</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </Select>
            <Input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
            <Input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryBox title="Kampanya" value={resultCount} />
        <SummaryBox title="Alıcı" value={summary.totalRecipients} />
        <SummaryBox title="Başarılı" value={summary.success} tone="success" />
        <SummaryBox title="Hatalı" value={summary.failed} tone="danger" />
        <SummaryBox title="Bekleyen" value={summary.pending} tone="warning" />
        <SummaryBox title="Hata Oranı" value={`%${summary.failureRate}`} tone={summary.failed > 0 ? "danger" : "success"} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <StatusBadge label={`${resultCount} sonuç`} tone="info" />
        {summary.skippedRecipients > 0 && <StatusBadge label={`${summary.skippedRecipients} atlandı`} tone="warning" />}
        <span>Son 100 kampanya içinde filtreleniyor.</span>
      </div>
    </div>
  )
}
