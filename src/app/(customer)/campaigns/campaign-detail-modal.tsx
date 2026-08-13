"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import type { ProviderErrorInfo } from "@/lib/provider-errors"
import type { SmsCampaign, SmsMessage } from "@/types"
import { getPhoneFormatIssue, type PhoneFormatIssue } from "./campaign-phone"
import {
  estimatedProviderUnits,
  formatDate,
  messageStatusLabel,
  messageStatusTone,
  providerStatusLabel,
  providerStatusTone,
  statusLabels,
} from "./campaign-utils"
import { CleanupAction, ProviderErrorBox, ProviderErrorInline, ReportMetric } from "./campaign-detail-components"

type DetailErrorGroup = {
  code: string
  info: ProviderErrorInfo
  count: number
}

type DetailPhoneIssueGroup = {
  issue: PhoneFormatIssue
  count: number
  examples: string[]
}

type CampaignDetailModalProps = {
  campaign: SmsCampaign
  messages: SmsMessage[]
  loading: boolean
  errorGroups: DetailErrorGroup[]
  phoneIssueGroups: DetailPhoneIssueGroup[]
  failedMessages: SmsMessage[]
  failedUniqueRecipientCount: number
  suppressionCandidateCount: number
  onExportCsv: () => void
  onExportFailedCsv: () => void
  onOpenFailedContacts: () => void
  onOpenFailedSegmentModal: () => void
  onAddFailedToSuppression: () => void
  onPrintReport: () => void
  onClose: () => void
}

export function CampaignDetailModal({
  campaign,
  messages,
  loading,
  errorGroups,
  phoneIssueGroups,
  failedMessages,
  failedUniqueRecipientCount,
  suppressionCandidateCount,
  onExportCsv,
  onExportFailedCsv,
  onOpenFailedContacts,
  onOpenFailedSegmentModal,
  onAddFailedToSuppression,
  onPrintReport,
  onClose,
}: CampaignDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
      <Card title="Kampanya Raporu" className="max-h-[90vh] w-full max-w-5xl overflow-y-auto shadow-2xl">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-950">{campaign.name || "SMS Kampanyası"}</p>
              <p className="mt-1 text-sm text-gray-500">{formatDate(campaign.created_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={statusLabels[campaign.status]} tone={campaign.status === "completed" ? "success" : campaign.status === "failed" ? "danger" : "warning"} />
              <StatusBadge label={providerStatusLabel(campaign.provider_status)} tone={providerStatusTone(campaign.provider_status)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <ReportMetric label="Alıcı" value={campaign.total_recipients.toString()} />
            <ReportMetric label="Atlanan" value={(campaign.skipped_recipients ?? 0).toString()} tone="amber" />
            <ReportMetric label="Başarılı" value={(campaign.provider_success_count ?? campaign.success_count ?? 0).toString()} tone="emerald" />
            <ReportMetric label="Hatalı" value={(campaign.provider_failed_count ?? campaign.fail_count ?? 0).toString()} tone="red" />
            <ReportMetric label="Bekleyen" value={(campaign.provider_pending_count ?? 0).toString()} tone="amber" />
            <ReportMetric label="Tahmini Birim" value={`${estimatedProviderUnits(campaign)}`} />
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">Provider</p>
              <p className="mt-2 font-semibold text-gray-950">{campaign.provider_name || "-"}</p>
              <p className="mt-1 font-mono text-xs text-gray-500">{campaign.provider_bulk_id || "Bulk ID yok"}</p>
              <p className="mt-2 text-gray-600">{campaign.provider_status_text || "Provider açıklaması yok"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">Mesaj</p>
              <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-gray-700">{campaign.message}</p>
            </div>
          </div>

          {errorGroups.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-950">Provider Hata Analizi</p>
                <span className="text-xs font-medium text-amber-800">{errorGroups.length} farklı hata kodu</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {errorGroups.slice(0, 4).map((group) => (
                  <ProviderErrorBox key={group.code} code={group.code} count={group.count} info={group.info} />
                ))}
              </div>
            </div>
          )}

          {phoneIssueGroups.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-blue-950">Numara Temizliği</p>
                <span className="text-xs font-medium text-blue-800">{phoneIssueGroups.length} farklı format uyarısı</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {phoneIssueGroups.slice(0, 4).map((group) => (
                  <PhoneIssueBox key={group.issue.type} issue={group.issue} count={group.count} examples={group.examples} />
                ))}
              </div>
            </div>
          )}

          {failedMessages.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-red-950">Başarısız Alıcı Temizliği</p>
                  <p className="mt-1 text-sm leading-6 text-red-800">
                    {failedMessages.length} başarısız kayıt içinde {failedUniqueRecipientCount} tekil numara var.
                    Bu alanı destek incelemesi, CRM temizliği, segmentleme veya kara liste akışı için kullanabilirsiniz.
                  </p>
                </div>
                <StatusBadge label={`${suppressionCandidateCount} kara liste adayı`} tone={suppressionCandidateCount > 0 ? "warning" : "neutral"} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <CleanupAction
                  title="CSV indir"
                  description="Destek ekibi veya dış temizlik için başarısız alıcıları dosya olarak alın."
                  action="CSV İndir"
                  onClick={onExportFailedCsv}
                  disabled={loading}
                />
                <CleanupAction
                  title="CRM'de filtrele"
                  description="Eşleşen kişi kayıtlarını Kişiler ekranında açıp manuel kontrol edin."
                  action="Kişilerde Aç"
                  onClick={onOpenFailedContacts}
                  disabled={loading}
                />
                <CleanupAction
                  title="Segmente aktar"
                  description="Eşleşen kişileri yeni veya mevcut bir segmente taşıyın."
                  action="Segment Seç"
                  onClick={onOpenFailedSegmentModal}
                  disabled={loading}
                />
                <CleanupAction
                  title="Kara listeye ekle"
                  description="Numara formatı veya provider hatası olan adayları sonraki gönderimlerden çıkarın."
                  action="Kara Listeye Ekle"
                  onClick={onAddFailedToSuppression}
                  disabled={loading || suppressionCandidateCount === 0}
                  primary
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {failedMessages.slice(0, 8).map((message) => (
                  <span key={message.id} className="rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold text-red-800">
                    {message.recipient}
                  </span>
                ))}
                {failedMessages.length > 8 && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                    +{failedMessages.length - 8} kayıt
                  </span>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-950">Alıcı Sonuçları</p>
              <span className="text-xs text-gray-500">En fazla 500 kayıt gösteriliyor</span>
            </div>
            {loading ? (
              <LoadingState variant="table" rows={5} />
            ) : messages.length > 0 ? (
              <Table>
                <THead>
                  <Tr>
                    <Th>Alıcı</Th>
                    <Th>Numara Analizi</Th>
                    <Th>Başlık</Th>
                    <Th>Durum</Th>
                    <Th>Provider</Th>
                    <Th>Kod / Açıklama</Th>
                    <Th>Anlam</Th>
                    <Th>Tarih</Th>
                  </Tr>
                </THead>
                <TBody>
                  {messages.map((message) => (
                    <Tr key={message.id}>
                      <Td className="font-mono text-sm">{message.recipient}</Td>
                      <Td className="max-w-xs">
                        <PhoneIssueInline recipient={message.recipient} />
                      </Td>
                      <Td className="font-mono text-xs">{message.sender_id}</Td>
                      <Td><StatusBadge label={messageStatusLabel(message.status)} tone={messageStatusTone(message.status)} /></Td>
                      <Td>{message.provider_name || "-"}</Td>
                      <Td className="max-w-xs truncate" title={message.provider_status_text || message.provider_error || undefined}>
                        {message.provider_status_code || "-"} {message.provider_status_text || message.provider_error || ""}
                      </Td>
                      <Td className="max-w-xs">
                        <ProviderErrorInline providerName={message.provider_name} code={message.provider_status_code} />
                      </Td>
                      <Td className="text-sm text-gray-500">{formatDate(message.created_at)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="Mesaj sonucu yok" description="Bu kampanya için alıcı bazlı kayıt bulunamadı." />
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onExportCsv} disabled={loading}>
              CSV İndir
            </Button>
            <Button variant="secondary" onClick={onExportFailedCsv} disabled={loading || failedMessages.length === 0}>
              Başarısızları CSV İndir
            </Button>
            <Button variant="secondary" onClick={onOpenFailedContacts} disabled={loading || failedMessages.length === 0}>
              Kişilerde Temizle
            </Button>
            <Button variant="secondary" onClick={onOpenFailedSegmentModal} disabled={loading || failedMessages.length === 0}>
              Segmente Aktar
            </Button>
            <Button variant="secondary" onClick={onAddFailedToSuppression} disabled={loading || suppressionCandidateCount === 0}>
              Kara Listeye Ekle
            </Button>
            <Button variant="secondary" onClick={onPrintReport} disabled={loading}>
              PDF / Yazdır
            </Button>
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function PhoneIssueBox({ issue, count, examples }: { issue: PhoneFormatIssue; count: number; examples: string[] }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-white p-3 text-blue-950">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase">{issue.severity === "warning" ? "Düzeltme Gerekli" : "Normalize Edilebilir"}</p>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{count} kayıt</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{issue.title}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{issue.description}</p>
      <p className="mt-2 text-xs font-medium">{issue.action}</p>
      {examples.length > 0 && (
        <p className="mt-2 break-all font-mono text-xs text-gray-500">Örnek: {examples.join(", ")}</p>
      )}
    </div>
  )
}

function PhoneIssueInline({ recipient }: { recipient?: string | null }) {
  const issue = getPhoneFormatIssue(recipient)
  if (!issue) return <span className="text-xs text-emerald-700">Standart format</span>

  return (
    <div>
      <p className="text-xs font-semibold text-gray-950">{issue.title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{issue.action}</p>
    </div>
  )
}
