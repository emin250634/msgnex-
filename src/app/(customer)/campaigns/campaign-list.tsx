"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import type { Group, SmsCampaign } from "@/types"
import {
  campaignReuseHref,
  formatDate,
  providerStatusLabel,
  providerStatusTone,
  shortId,
  statusClasses,
  statusLabels,
} from "./campaign-utils"

type CampaignListProps = {
  campaigns: SmsCampaign[]
  groupMap: Map<string, Group>
  hasActiveFilters: boolean
  onOpenDetails: (campaign: SmsCampaign) => void
  onCancelCampaign: (campaign: SmsCampaign) => void
  onClearFilters: () => void
  onReload: () => void
}

export function CampaignList({
  campaigns,
  groupMap,
  hasActiveFilters,
  onOpenDetails,
  onCancelCampaign,
  onClearFilters,
  onReload,
}: CampaignListProps) {
  const emptyState = (
    <EmptyState
      icon={<span className="text-2xl">KP</span>}
      title={hasActiveFilters ? "Filtreye uygun kampanya yok" : "Henüz kampanya yok"}
      description={hasActiveFilters ? "Arama veya filtreleri değiştirerek tekrar deneyin." : "İlk SMS kampanyanızı oluşturduğunuzda burada listelenecek."}
      action={<Button variant="secondary" onClick={hasActiveFilters ? onClearFilters : onReload}>{hasActiveFilters ? "Filtreleri Temizle" : "Yenile"}</Button>}
    />
  )

  return (
    <>
      <div className="space-y-3 lg:hidden">
        {campaigns.length > 0 ? campaigns.map((campaign) => {
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
              <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => onOpenDetails(campaign)}>
                Rapor
              </Button>
              <Link href={campaignReuseHref(campaign)}>
                <Button variant="secondary" size="sm" className="mt-3 w-full">
                  Tekrar Kullan
                </Button>
              </Link>
              {campaign.status === "queued" && (
                <Button variant="danger" size="sm" className="mt-4 w-full" onClick={() => onCancelCampaign(campaign)}>
                  İptal Et
                </Button>
              )}
            </div>
          )
        }) : emptyState}
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
            {campaigns.map((campaign) => {
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
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => onOpenDetails(campaign)}>
                        Rapor
                      </Button>
                      <Link href={campaignReuseHref(campaign)}>
                        <Button variant="secondary" size="sm">
                          Tekrar Kullan
                        </Button>
                      </Link>
                      {campaign.status === "queued" && (
                        <Button variant="danger" size="sm" onClick={() => onCancelCampaign(campaign)}>
                          İptal Et
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              )
            })}
            {campaigns.length === 0 && (
              <Tr>
                <Td colSpan={10}>
                  {emptyState}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </div>
    </>
  )
}
