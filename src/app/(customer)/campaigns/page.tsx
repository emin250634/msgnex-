"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { SmsCampaign } from "@/types"

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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("sms_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
    setCampaigns(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCancel = async (id: string) => {
    if (!window.confirm("Bu kampanya iptal edilsin mi? Ayrılan kredi bakiyenize iade edilecek.")) return
    const supabase = createClient()
    const { data, error } = await supabase.rpc("cancel_queued_sms_campaign", {
      p_campaign_id: id,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`${data.refund} kredi iade edildi`)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

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
        <Table>
          <THead>
            <Tr>
              <Th>Tarih</Th>
              <Th>Mesaj</Th>
              <Th>Alıcı</Th>
              <Th>Durum</Th>
              <Th>Provider</Th>
              <Th>Provider Durumu</Th>
              <Th>Provider Sonuçları</Th>
              <Th>DLR Son Kontrol</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {campaigns.map((campaign) => (
              <Tr key={campaign.id}>
                <Td className="text-sm text-gray-500">{formatDate(campaign.created_at)}</Td>
                <Td className="max-w-sm truncate" title={campaign.message}>{campaign.message}</Td>
                <Td>
                  <div className="text-sm font-medium text-gray-900">{campaign.total_recipients}</div>
                  {campaign.skipped_recipients > 0 && (
                    <div className="text-xs text-amber-700">{campaign.skipped_recipients} atlandı</div>
                  )}
                </Td>
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
                    <Button variant="danger" size="sm" onClick={() => handleCancel(campaign.id)}>
                      İptal Et
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
            {campaigns.length === 0 && (
              <Tr><Td colSpan={9} className="text-center text-gray-500">Henüz kampanya bulunmuyor.</Td></Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
