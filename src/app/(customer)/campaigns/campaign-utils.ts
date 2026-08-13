import { calculateSmsSegments } from "@/lib/sms-segments"
import type { SmsCampaign } from "@/types"

export type CampaignStatusFilter = "all" | SmsCampaign["status"]
export type DlrFilter = "all" | "awaiting" | "checked" | "completed" | "none"

export const statusLabels: Record<SmsCampaign["status"], string> = {
  draft: "Taslak",
  queued: "Kuyrukta",
  scheduled: "Planlandı",
  sending: "Gönderiliyor",
  completed: "Tamamlandı",
  failed: "Hata",
  cancelled: "İptal Edildi",
  review_required: "İnceleme Gerekli",
}

export const statusClasses: Record<SmsCampaign["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  sending: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
  review_required: "bg-orange-100 text-orange-700",
}

export function providerStatusLabel(status?: string | null) {
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

export function providerStatusTone(status?: string | null) {
  if (!status) return "neutral" as const
  if (status === "delivered") return "success" as const
  if (status === "failed") return "danger" as const
  if (status.includes("review") || status.includes("partial")) return "warning" as const
  return "info" as const
}

export function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

export function shortId(value?: string | null) {
  if (!value) return "-"
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value
}

export function dateOnly(value?: string | null) {
  if (!value) return ""
  return value.slice(0, 10)
}

export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function monthStartInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
}

export function estimatedProviderUnits(campaign: SmsCampaign) {
  return campaign.total_recipients * calculateSmsSegments(campaign.message).segments
}

export function matchesDateRange(value: string, from: string, to: string) {
  const date = dateOnly(value)
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export function matchesDlr(campaign: SmsCampaign, filter: DlrFilter) {
  if (filter === "all") return true
  if (filter === "awaiting") return campaign.provider_status === "awaiting_dlr"
  if (filter === "checked") return Boolean(campaign.dlr_last_checked_at)
  if (filter === "completed") return Boolean(campaign.dlr_completed_at)
  if (filter === "none") return !campaign.dlr_last_checked_at && !campaign.dlr_completed_at
  return true
}

export function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

export function campaignReuseHref(campaign: SmsCampaign) {
  const params = new URLSearchParams({
    source: "campaign-copy",
    message: campaign.message,
  })

  if (campaign.group_id) params.set("group", campaign.group_id)

  return `/sms?${params.toString()}`
}
