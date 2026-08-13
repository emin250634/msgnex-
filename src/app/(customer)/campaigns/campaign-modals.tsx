"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { calculateSmsSegments } from "@/lib/sms-segments"
import type { Group, SmsCampaign } from "@/types"
import { estimatedProviderUnits } from "./campaign-utils"
import { CancelMetric, Select } from "./campaign-detail-components"

type CampaignCancelModalProps = {
  campaign: SmsCampaign
  cancelling: boolean
  onConfirm: () => void
  onClose: () => void
}

export function CampaignCancelModal({ campaign, cancelling, onConfirm, onClose }: CampaignCancelModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
      <Card title="Kampanya İptal Onayı" className="w-full max-w-xl shadow-2xl">
        <div className="space-y-5">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="text-lg font-semibold text-red-950">Bu kampanya iptal edilecek</p>
            <p className="mt-1">İptal işlemi yalnızca henüz provider&apos;a gönderilmemiş kuyruktaki kampanyalar için uygulanır.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CancelMetric label="Etkilenecek kişi" value={`${campaign.total_recipients} kişi`} />
            <CancelMetric label="Atlanan kişi" value={`${campaign.skipped_recipients ?? 0} kişi`} />
            <CancelMetric label="Mesaj parçası" value={`${calculateSmsSegments(campaign.message).segments} parça`} />
            <CancelMetric label="Tahmini sağlayıcı kredi kullanımı" value={`${estimatedProviderUnits(campaign)} SMS parçası`} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Mesaj</p>
            <p className="mt-2 max-h-24 overflow-hidden text-sm leading-6 text-gray-700">{campaign.message}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="danger" onClick={onConfirm} disabled={cancelling}>
              {cancelling ? "İptal ediliyor..." : "Evet, Kampanyayı İptal Et"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={cancelling}>
              Vazgeç
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

type FailedRecipientsSegmentModalProps = {
  campaign: SmsCampaign
  groups: Group[]
  selectedGroupId: string
  newSegmentName: string
  failedCount: number
  failedUniqueRecipientCount: number
  suppressionCandidateCount: number
  segmenting: boolean
  onSelectedGroupChange: (value: string) => void
  onNewSegmentNameChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function FailedRecipientsSegmentModal({
  campaign,
  groups,
  selectedGroupId,
  newSegmentName,
  failedCount,
  failedUniqueRecipientCount,
  suppressionCandidateCount,
  segmenting,
  onSelectedGroupChange,
  onNewSegmentNameChange,
  onConfirm,
  onClose,
}: FailedRecipientsSegmentModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/40 p-4">
      <Card title="Başarısızları Segmente Aktar" className="w-full max-w-xl shadow-2xl">
        <div className="space-y-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Bu işlem başarısız numaralarla CRM kişi listesinde eşleşen kayıtların segmentini günceller. Eşleşmeyen numaralar için CSV veya kara liste akışını kullanabilirsiniz.
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mevcut segment</label>
            <Select value={selectedGroupId} onChange={onSelectedGroupChange}>
              <option value="">Yeni segment oluştur</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </Select>
          </div>

          {!selectedGroupId && (
            <Input
              label="Yeni segment adı"
              value={newSegmentName}
              onChange={(event) => onNewSegmentNameChange(event.target.value)}
              placeholder="Kampanya Hatalı Numaralar"
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <CancelMetric label="Başarısız alıcı" value={`${failedCount} kayıt`} />
            <CancelMetric label="Tekil numara" value={`${failedUniqueRecipientCount} numara`} />
            <CancelMetric label="Kampanya" value={campaign.name || campaign.id.slice(0, 8)} />
            <CancelMetric label="Kara liste adayı" value={`${suppressionCandidateCount} kayıt`} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onConfirm} disabled={segmenting || (!selectedGroupId && !newSegmentName.trim())}>
              {segmenting ? "Aktarılıyor..." : "Segmente Aktar"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={segmenting}>
              Vazgeç
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
