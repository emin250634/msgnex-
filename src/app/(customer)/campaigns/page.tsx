"use client"

import Link from "next/link"
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
import { getProviderErrorInfo, providerErrorSummary } from "@/lib/provider-errors"
import { calculateSmsSegments } from "@/lib/sms-segments"
import { createClient } from "@/lib/supabase/client"
import type { Group, SmsCampaign, SmsMessage } from "@/types"

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

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function monthStartInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
}

function estimatedProviderUnits(campaign: SmsCampaign) {
  return campaign.total_recipients * calculateSmsSegments(campaign.message).segments
}

interface PhoneFormatIssue {
  type: string
  title: string
  description: string
  action: string
  severity: "info" | "warning"
}

function getPhoneFormatIssue(recipient?: string | null): PhoneFormatIssue | null {
  const value = (recipient || "").trim()
  const digits = value.replace(/\D/g, "")

  if (!value) {
    return {
      type: "empty",
      title: "Boş numara",
      description: "Alıcı numarası boş görünüyor.",
      action: "Kişi kaydına geçerli bir cep telefonu ekleyin.",
      severity: "warning",
    }
  }

  if (/[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(value)) {
    return {
      type: "letters",
      title: "Harf içeren numara",
      description: "Telefon alanında harf veya açıklama metni var.",
      action: "Telefon alanını sadece rakamlardan oluşacak şekilde temizleyin.",
      severity: "warning",
    }
  }

  if (digits.length < 10) {
    return {
      type: "short",
      title: "Eksik haneli numara",
      description: "Cep telefonu için gerekli 10 hane tamamlanmamış.",
      action: "Eksik kayıtları müşteri listenizde düzeltin veya gönderimden çıkarın.",
      severity: "warning",
    }
  }

  if (digits.length > 12) {
    return {
      type: "long",
      title: "Fazla haneli numara",
      description: "Telefon alanında ek rakamlar veya birleşmiş birden fazla numara olabilir.",
      action: "Numarayı tek cep telefonu olacak şekilde ayırın ve 5XXXXXXXXX formatına indirin.",
      severity: "warning",
    }
  }

  if (digits.length === 12 && digits.startsWith("90")) {
    return {
      type: "country_code",
      title: "+90 / 90 ile başlayan numara",
      description: "Numara Türkiye ülke kodu ile kaydedilmiş.",
      action: "Listeyi standart 5XXXXXXXXX formatına normalize edin.",
      severity: "info",
    }
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return {
      type: "leading_zero",
      title: "0 ile başlayan numara",
      description: "Numara başında yerel arama sıfırı var.",
      action: "Başındaki 0 kaldırılarak 5XXXXXXXXX formatında saklayın.",
      severity: "info",
    }
  }

  if (digits.length === 10 && !digits.startsWith("5")) {
    return {
      type: "not_mobile",
      title: "Mobil olmayan format",
      description: "Türkiye cep telefonu formatı 5 ile başlamalıdır.",
      action: "Sabit hat veya hatalı kayıtları kişi listesinden ayırın.",
      severity: "warning",
    }
  }

  if (digits.length === 10 && digits.startsWith("5") && /[^\d]/.test(value)) {
    return {
      type: "separators",
      title: "Ayraç içeren numara",
      description: "Numara doğru görünüyor ancak boşluk, parantez veya tire içeriyor.",
      action: "Veri kalitesi için telefonları sadece rakam olarak saklayın.",
      severity: "info",
    }
  }

  return null
}

function phoneIssueSummary(recipient?: string | null) {
  return getPhoneFormatIssue(recipient)?.title || "Standart format"
}

function isSuppressionCandidate(message: SmsMessage) {
  const issue = getPhoneFormatIssue(message.recipient)
  const providerCode = message.provider_status_code
  const numberErrorCodes = new Set(["50", "51", "52", "INVALID_RECIPIENT"])

  return Boolean(
    issue?.severity === "warning" ||
    (providerCode && numberErrorCodes.has(providerCode))
  )
}

function normalizePhoneForCompare(phone?: string | null) {
  const digits = (phone || "").replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("90")) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  return digits
}

function csvValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function fileSafeDate(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function campaignReportFileName(campaign: SmsCampaign, extension: "csv" | "html") {
  const name = (campaign.name || "kampanya")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "kampanya"

  return `msgnex-${name}-${fileSafeDate(campaign.created_at)}.${extension}`
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildCampaignReportCsv(campaign: SmsCampaign, messages: SmsMessage[]) {
  const rows = [
    [
      "Kampanya ID",
      "Kampanya Adı",
      "Kampanya Tarihi",
      "Kampanya Durumu",
      "Provider",
      "Provider Bulk ID",
      "Provider Durumu",
      "Toplam Alıcı",
      "Atlanan",
      "Başarılı",
      "Hatalı",
      "Bekleyen",
      "Tahmini Birim",
      "Alıcı",
      "Numara Format Analizi",
      "Numara Temizlik Önerisi",
      "Başlık",
      "Mesaj Durumu",
      "Provider Mesaj ID",
      "Provider Kod",
      "Provider Açıklama",
      "Hata Anlamı",
      "Önerilen Aksiyon",
      "Hata",
      "Oluşturma Tarihi",
      "Gönderim Tarihi",
      "Teslim Tarihi",
      "Hata Tarihi",
    ],
    ...messages.map((message) => {
      const errorInfo = getProviderErrorInfo(message.provider_name, message.provider_status_code)
      const phoneIssue = getPhoneFormatIssue(message.recipient)

      return [
        campaign.id,
        campaign.name || "SMS Kampanyası",
        formatDate(campaign.created_at),
        statusLabels[campaign.status],
        campaign.provider_name || "",
        campaign.provider_bulk_id || "",
        providerStatusLabel(campaign.provider_status),
        campaign.total_recipients,
        campaign.skipped_recipients ?? 0,
        campaign.provider_success_count ?? campaign.success_count ?? 0,
        campaign.provider_failed_count ?? campaign.fail_count ?? 0,
        campaign.provider_pending_count ?? 0,
        estimatedProviderUnits(campaign),
        message.recipient,
        phoneIssue?.title || "Standart format",
        phoneIssue?.action || "",
        message.sender_id,
        messageStatusLabel(message.status),
        message.provider_message_id || "",
        message.provider_status_code || "",
        message.provider_status_text || "",
        errorInfo?.title || "",
        errorInfo?.action || "",
        message.provider_error || "",
        formatDate(message.created_at),
        formatDate(message.sent_at),
        formatDate(message.delivered_at),
        formatDate(message.failed_at),
      ]
    }),
  ]

  return rows.map((row) => row.map(csvValue).join(",")).join("\n")
}

function buildFailedRecipientsCsv(campaign: SmsCampaign, messages: SmsMessage[]) {
  const failedMessages = messages.filter((message) => message.status === "failed" || Boolean(message.provider_error))
  const rows = [
    [
      "Kampanya ID",
      "Kampanya Adı",
      "Alıcı",
      "Numara Format Analizi",
      "Numara Temizlik Önerisi",
      "Provider",
      "Provider Mesaj ID",
      "Provider Kod",
      "Provider Açıklama",
      "Hata Anlamı",
      "Önerilen Aksiyon",
      "Hata",
      "Hata Tarihi",
    ],
    ...failedMessages.map((message) => {
      const errorInfo = getProviderErrorInfo(message.provider_name, message.provider_status_code)
      const phoneIssue = getPhoneFormatIssue(message.recipient)

      return [
        campaign.id,
        campaign.name || "SMS Kampanyası",
        message.recipient,
        phoneIssue?.title || "Standart format",
        phoneIssue?.action || "",
        message.provider_name || "",
        message.provider_message_id || "",
        message.provider_status_code || "",
        message.provider_status_text || "",
        errorInfo?.title || "",
        errorInfo?.action || "",
        message.provider_error || "",
        formatDate(message.failed_at || message.created_at),
      ]
    }),
  ]

  return rows.map((row) => row.map(csvValue).join(",")).join("\n")
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function buildCampaignReportHtml(campaign: SmsCampaign, messages: SmsMessage[]) {
  const metrics = [
    ["Toplam Alıcı", campaign.total_recipients],
    ["Atlanan", campaign.skipped_recipients ?? 0],
    ["Başarılı", campaign.provider_success_count ?? campaign.success_count ?? 0],
    ["Hatalı", campaign.provider_failed_count ?? campaign.fail_count ?? 0],
    ["Bekleyen", campaign.provider_pending_count ?? 0],
    ["Tahmini Birim", estimatedProviderUnits(campaign)],
  ]
  const phoneIssueGroups = Array.from(messages.reduce((groups, message) => {
    const issue = getPhoneFormatIssue(message.recipient)
    if (!issue) return groups

    const current = groups.get(issue.type)
    if (current) {
      current.count += 1
    } else {
      groups.set(issue.type, { issue, count: 1 })
    }

    return groups
  }, new Map<string, { issue: PhoneFormatIssue; count: number }>()).values()).sort((first, second) => second.count - first.count)

  const messageRows = messages.map((message) => `
    <tr>
      <td>${htmlEscape(message.recipient)}</td>
      <td>${htmlEscape(phoneIssueSummary(message.recipient))}</td>
      <td>${htmlEscape(message.sender_id)}</td>
      <td>${htmlEscape(messageStatusLabel(message.status))}</td>
      <td>${htmlEscape(message.provider_name || "-")}</td>
      <td>${htmlEscape(providerErrorSummary(message.provider_name, message.provider_status_code))}</td>
      <td>${htmlEscape(message.provider_status_text || message.provider_error || "-")}</td>
      <td>${htmlEscape(getProviderErrorInfo(message.provider_name, message.provider_status_code)?.action || "-")}</td>
      <td>${htmlEscape(formatDate(message.created_at))}</td>
    </tr>
  `).join("")

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>MSGNEX Kampanya Raporu</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    h2 { font-size: 16px; margin: 28px 0 10px; }
    p { margin: 4px 0; color: #4b5563; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20px; }
    .metric { border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; }
    .metric span { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 6px; font-size: 20px; }
    .notice-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
    .notice { border: 1px solid #bfdbfe; background: #eff6ff; padding: 10px; border-radius: 8px; }
    .notice strong { display: block; font-size: 13px; }
    .notice span { display: block; margin-top: 4px; color: #4b5563; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #4b5563; }
    .message { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-top: 10px; }
    @media print { body { margin: 18mm; } button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">PDF / Yazdır</button>
  <h1>${htmlEscape(campaign.name || "SMS Kampanyası")}</h1>
  <p>${htmlEscape(formatDate(campaign.created_at))}</p>
  <p>Durum: ${htmlEscape(statusLabels[campaign.status])} | Provider: ${htmlEscape(campaign.provider_name || "-")} | Provider durumu: ${htmlEscape(providerStatusLabel(campaign.provider_status))}</p>
  <div class="metrics">
    ${metrics.map(([label, value]) => `<div class="metric"><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`).join("")}
  </div>
  <h2>Mesaj</h2>
  <div class="message">${htmlEscape(campaign.message)}</div>
  ${phoneIssueGroups.length > 0 ? `
  <h2>Numara Temizliği</h2>
  <div class="notice-grid">
    ${phoneIssueGroups.slice(0, 4).map((group) => `
      <div class="notice">
        <strong>${htmlEscape(group.issue.title)} - ${htmlEscape(group.count)} kayıt</strong>
        <span>${htmlEscape(group.issue.action)}</span>
      </div>
    `).join("")}
  </div>` : ""}
  <h2>Alıcı Sonuçları</h2>
  <table>
    <thead>
      <tr>
        <th>Alıcı</th>
        <th>Numara Analizi</th>
        <th>Başlık</th>
        <th>Durum</th>
        <th>Provider</th>
        <th>Kod / Anlam</th>
        <th>Açıklama</th>
        <th>Önerilen Aksiyon</th>
        <th>Tarih</th>
      </tr>
    </thead>
    <tbody>${messageRows || `<tr><td colspan="9">Alıcı sonucu yok</td></tr>`}</tbody>
  </table>
</body>
</html>`
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

function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function campaignReuseHref(campaign: SmsCampaign) {
  const params = new URLSearchParams({
    source: "campaign-copy",
    message: campaign.message,
  })

  if (campaign.group_id) params.set("group", campaign.group_id)

  return `/sms?${params.toString()}`
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelTarget, setCancelTarget] = useState<SmsCampaign | null>(null)
  const [detailTarget, setDetailTarget] = useState<SmsCampaign | null>(null)
  const [detailMessages, setDetailMessages] = useState<SmsMessage[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all")
  const [providerFilter, setProviderFilter] = useState("all")
  const [dlrFilter, setDlrFilter] = useState<DlrFilter>("all")
  const [groupFilter, setGroupFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [segmentModalOpen, setSegmentModalOpen] = useState(false)
  const [segmentGroupId, setSegmentGroupId] = useState("")
  const [newSegmentName, setNewSegmentName] = useState("")
  const [segmenting, setSegmenting] = useState(false)

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
  const filteredSummary = useMemo(() => {
    const totalRecipients = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.total_recipients ?? 0), 0)
    const skippedRecipients = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.skipped_recipients ?? 0), 0)
    const success = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.provider_success_count ?? campaign.success_count ?? 0), 0)
    const failed = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.provider_failed_count ?? campaign.fail_count ?? 0), 0)
    const pending = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.provider_pending_count ?? 0), 0)

    return {
      totalRecipients,
      skippedRecipients,
      success,
      failed,
      pending,
      failureRate: percent(failed, success + failed + pending),
    }
  }, [filteredCampaigns])
  const detailErrorGroups = useMemo(() => {
    const groups = new Map<string, { code: string; info: ReturnType<typeof getProviderErrorInfo>; count: number }>()

    detailMessages.forEach((message) => {
      const code = message.provider_status_code
      const info = getProviderErrorInfo(message.provider_name, code)
      if (!code || !info || info.severity === "info") return

      const key = `${message.provider_name || "provider"}:${code}`
      const current = groups.get(key)
      if (current) {
        current.count += 1
      } else {
        groups.set(key, { code, info, count: 1 })
      }
    })

    return Array.from(groups.values()).sort((first, second) => second.count - first.count)
  }, [detailMessages])
  const detailPhoneIssueGroups = useMemo(() => {
    const groups = new Map<string, { issue: PhoneFormatIssue; count: number; examples: string[] }>()

    detailMessages.forEach((message) => {
      const issue = getPhoneFormatIssue(message.recipient)
      if (!issue) return

      const current = groups.get(issue.type)
      if (current) {
        current.count += 1
        if (current.examples.length < 3) current.examples.push(message.recipient)
      } else {
        groups.set(issue.type, { issue, count: 1, examples: [message.recipient] })
      }
    })

    return Array.from(groups.values()).sort((first, second) => second.count - first.count)
  }, [detailMessages])
  const failedDetailMessages = useMemo(
    () => detailMessages.filter((message) => message.status === "failed" || Boolean(message.provider_error)),
    [detailMessages]
  )
  const suppressionCandidateMessages = useMemo(
    () => failedDetailMessages.filter(isSuppressionCandidate),
    [failedDetailMessages]
  )

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setProviderFilter("all")
    setDlrFilter("all")
    setGroupFilter("all")
    setDateFrom("")
    setDateTo("")
  }

  const applyDatePreset = (preset: "today" | "last7" | "last30" | "month") => {
    const today = new Date()
    const start = new Date(today)

    if (preset === "today") {
      setDateFrom(toDateInputValue(today))
      setDateTo(toDateInputValue(today))
      return
    }
    if (preset === "last7") start.setDate(today.getDate() - 6)
    if (preset === "last30") start.setDate(today.getDate() - 29)

    setDateFrom(preset === "month" ? monthStartInputValue(today) : toDateInputValue(start))
    setDateTo(toDateInputValue(today))
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

    toast.success("Kampanya iptal edildi")
    setCancelTarget(null)
    load()
  }

  const openDetails = async (campaign: SmsCampaign) => {
    setDetailTarget(campaign)
    setDetailMessages([])
    setDetailLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) toast.error(error.message)
    setDetailMessages(data ?? [])
    setDetailLoading(false)
  }

  const exportDetailCsv = () => {
    if (!detailTarget) return
    downloadTextFile(
      campaignReportFileName(detailTarget, "csv"),
      `\uFEFF${buildCampaignReportCsv(detailTarget, detailMessages)}`,
      "text/csv;charset=utf-8"
    )
    toast.success("Kampanya raporu CSV olarak indirildi")
  }

  const exportFailedRecipientsCsv = () => {
    if (!detailTarget) return
    if (failedDetailMessages.length === 0) {
      toast.error("Bu raporda başarısız alıcı kaydı yok.")
      return
    }

    downloadTextFile(
      campaignReportFileName(detailTarget, "csv").replace(".csv", "-basarisiz-alicilar.csv"),
      `\uFEFF${buildFailedRecipientsCsv(detailTarget, detailMessages)}`,
      "text/csv;charset=utf-8"
    )
    toast.success("Başarısız alıcı listesi CSV olarak indirildi")
  }

  const openFailedRecipientsInContacts = () => {
    if (!detailTarget) return
    if (failedDetailMessages.length === 0) {
      toast.error("Kişi temizleme için başarısız alıcı kaydı yok.")
      return
    }

    sessionStorage.setItem(
      "msgnex_failed_cleanup_phones",
      JSON.stringify(failedDetailMessages.map((message) => message.recipient))
    )
    window.location.href = "/contacts?cleanup=failed-campaign"
  }

  const addFailedRecipientsToSuppression = async () => {
    if (!detailTarget) return
    if (suppressionCandidateMessages.length === 0) {
      toast.error("Kara listeye eklenecek numara formatı/provider numara hatası bulunamadı.")
      return
    }

    const confirmed = window.confirm(`${suppressionCandidateMessages.length} başarısız numara kara listeye eklenecek. Sonraki gönderimlerde bu numaralar otomatik atlanır. Devam edilsin mi?`)
    if (!confirmed) return

    const supabase = createClient()
    const reason = `Kampanya başarısız alıcı temizliği: ${detailTarget.name || detailTarget.id}`
    const { data, error } = await supabase.rpc("add_suppression_entries", {
      p_phones: suppressionCandidateMessages.map((message) => message.recipient),
      p_reason: reason,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`${data ?? suppressionCandidateMessages.length} numara kara listeye işlendi`)
  }

  const openFailedRecipientsSegmentModal = () => {
    if (!detailTarget) return
    if (failedDetailMessages.length === 0) {
      toast.error("Segmente aktarılacak başarısız alıcı kaydı yok.")
      return
    }

    setSegmentGroupId("")
    setNewSegmentName(`Kampanya Hatalı Numaralar - ${fileSafeDate(detailTarget.created_at)}`)
    setSegmentModalOpen(true)
  }

  const assignFailedRecipientsToSegment = async () => {
    if (!detailTarget) return
    if (!segmentGroupId && !newSegmentName.trim()) {
      toast.error("Mevcut segment seçin veya yeni segment adı girin.")
      return
    }

    setSegmenting(true)
    const supabase = createClient()
    const { data: profile, error: profileError } = await supabase.from("profiles").select("company_id").maybeSingle()
    if (profileError || !profile?.company_id) {
      toast.error(profileError?.message || "Firma bilgisi alınamadı.")
      setSegmenting(false)
      return
    }

    let targetGroupId = segmentGroupId
    if (!targetGroupId) {
      const { data: createdGroup, error: groupError } = await supabase
        .from("groups")
        .insert({
          company_id: profile.company_id,
          name: newSegmentName.trim(),
          description: "Kampanya raporundan başarısız alıcı temizliği için oluşturuldu.",
        })
        .select("id, company_id, name, description, created_at, updated_at")
        .single()

      if (groupError || !createdGroup) {
        toast.error(groupError?.message || "Segment oluşturulamadı.")
        setSegmenting(false)
        return
      }

      targetGroupId = createdGroup.id
      setGroups((current) => [createdGroup as Group, ...current])
    }

    const failedPhones = new Set(failedDetailMessages.map((message) => normalizePhoneForCompare(message.recipient)).filter(Boolean))
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, phone")
      .eq("company_id", profile.company_id)

    if (contactsError) {
      toast.error(contactsError.message)
      setSegmenting(false)
      return
    }

    const contactIds = (contacts ?? [])
      .filter((contact) => failedPhones.has(normalizePhoneForCompare(contact.phone)))
      .map((contact) => contact.id)

    if (contactIds.length === 0) {
      toast.error("Başarısız numaralar CRM kişi listesinde eşleşmedi.")
      setSegmenting(false)
      return
    }

    const { error: updateError } = await supabase
      .from("contacts")
      .update({ group_id: targetGroupId })
      .in("id", contactIds)

    setSegmenting(false)

    if (updateError) {
      toast.error(updateError.message)
      return
    }

    toast.success(`${contactIds.length} kişi segmente aktarıldı`)
    setSegmentModalOpen(false)
  }

  const printDetailReport = () => {
    if (!detailTarget) return
    const reportWindow = window.open("", "_blank")
    if (!reportWindow) {
      toast.error("Rapor penceresi açılamadı. Tarayıcı pop-up iznini kontrol edin.")
      return
    }

    reportWindow.document.write(buildCampaignReportHtml(detailTarget, detailMessages))
    reportWindow.document.close()
    reportWindow.focus()
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
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => applyDatePreset("today")}>Bugün</Button>
                <Button variant="secondary" size="sm" onClick={() => applyDatePreset("last7")}>Son 7 Gün</Button>
                <Button variant="secondary" size="sm" onClick={() => applyDatePreset("last30")}>Son 30 Gün</Button>
                <Button variant="secondary" size="sm" onClick={() => applyDatePreset("month")}>Bu Ay</Button>
              </div>
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
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryBox title="Kampanya" value={filteredCampaigns.length} />
            <SummaryBox title="Alıcı" value={filteredSummary.totalRecipients} />
            <SummaryBox title="Başarılı" value={filteredSummary.success} tone="success" />
            <SummaryBox title="Hatalı" value={filteredSummary.failed} tone="danger" />
            <SummaryBox title="Bekleyen" value={filteredSummary.pending} tone="warning" />
            <SummaryBox title="Hata Oranı" value={`%${filteredSummary.failureRate}`} tone={filteredSummary.failed > 0 ? "danger" : "success"} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <StatusBadge label={`${filteredCampaigns.length} sonuç`} tone="info" />
            {filteredSummary.skippedRecipients > 0 && <StatusBadge label={`${filteredSummary.skippedRecipients} atlandı`} tone="warning" />}
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
                <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => openDetails(campaign)}>
                  Rapor
                </Button>
                <Link href={campaignReuseHref(campaign)}>
                  <Button variant="secondary" size="sm" className="mt-3 w-full">
                    Tekrar Kullan
                  </Button>
                </Link>
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
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openDetails(campaign)}>
                        Rapor
                      </Button>
                      <Link href={campaignReuseHref(campaign)}>
                        <Button variant="secondary" size="sm">
                          Tekrar Kullan
                        </Button>
                      </Link>
                      {campaign.status === "queued" && (
                        <Button variant="danger" size="sm" onClick={() => setCancelTarget(campaign)}>
                          İptal Et
                        </Button>
                      )}
                    </div>
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
                <p className="mt-1">İptal işlemi yalnızca henüz provider&apos;a gönderilmemiş kuyruktaki kampanyalar için uygulanır.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CancelMetric label="Etkilenecek kişi" value={`${cancelTarget.total_recipients} kişi`} />
                <CancelMetric label="Atlanan kişi" value={`${cancelTarget.skipped_recipients ?? 0} kişi`} />
                <CancelMetric label="Mesaj parçası" value={`${calculateSmsSegments(cancelTarget.message).segments} parça`} />
                <CancelMetric label="Tahmini sağlayıcı kredi kullanımı" value={`${estimatedProviderUnits(cancelTarget)} SMS parçası`} />
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

      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
          <Card title="Kampanya Raporu" className="max-h-[90vh] w-full max-w-5xl overflow-y-auto shadow-2xl">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-950">{detailTarget.name || "SMS Kampanyası"}</p>
                  <p className="mt-1 text-sm text-gray-500">{formatDate(detailTarget.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={statusLabels[detailTarget.status]} tone={detailTarget.status === "completed" ? "success" : detailTarget.status === "failed" ? "danger" : "warning"} />
                  <StatusBadge label={providerStatusLabel(detailTarget.provider_status)} tone={providerStatusTone(detailTarget.provider_status)} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <ReportMetric label="Alıcı" value={detailTarget.total_recipients.toString()} />
                <ReportMetric label="Atlanan" value={(detailTarget.skipped_recipients ?? 0).toString()} tone="amber" />
                <ReportMetric label="Başarılı" value={(detailTarget.provider_success_count ?? detailTarget.success_count ?? 0).toString()} tone="emerald" />
                <ReportMetric label="Hatalı" value={(detailTarget.provider_failed_count ?? detailTarget.fail_count ?? 0).toString()} tone="red" />
                <ReportMetric label="Bekleyen" value={(detailTarget.provider_pending_count ?? 0).toString()} tone="amber" />
                <ReportMetric label="Tahmini Birim" value={`${estimatedProviderUnits(detailTarget)}`} />
              </div>

              <div className="grid gap-4 text-sm md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Provider</p>
                  <p className="mt-2 font-semibold text-gray-950">{detailTarget.provider_name || "-"}</p>
                  <p className="mt-1 font-mono text-xs text-gray-500">{detailTarget.provider_bulk_id || "Bulk ID yok"}</p>
                  <p className="mt-2 text-gray-600">{detailTarget.provider_status_text || "Provider açıklaması yok"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Mesaj</p>
                  <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-gray-700">{detailTarget.message}</p>
                </div>
              </div>

              {detailErrorGroups.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-950">Provider Hata Analizi</p>
                    <span className="text-xs font-medium text-amber-800">{detailErrorGroups.length} farklı hata kodu</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {detailErrorGroups.slice(0, 4).map((group) => (
                      <ProviderErrorBox key={group.code} code={group.code} count={group.count} info={group.info} />
                    ))}
                  </div>
                </div>
              )}

              {detailPhoneIssueGroups.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-blue-950">Numara Temizliği</p>
                    <span className="text-xs font-medium text-blue-800">{detailPhoneIssueGroups.length} farklı format uyarısı</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {detailPhoneIssueGroups.slice(0, 4).map((group) => (
                      <PhoneIssueBox key={group.issue.type} issue={group.issue} count={group.count} examples={group.examples} />
                    ))}
                  </div>
                </div>
              )}

              {failedDetailMessages.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-950">Başarısız Alıcı Listesi</p>
                      <p className="mt-1 text-sm leading-6 text-red-800">
                        {failedDetailMessages.length} başarısız kayıt ayrı CSV olarak indirilebilir. Bu liste kişi temizliği veya destek incelemesi için kullanılabilir.
                        {suppressionCandidateMessages.length > 0 ? ` ${suppressionCandidateMessages.length} kayıt kara liste adayı.` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={exportFailedRecipientsCsv} disabled={detailLoading}>
                        Başarısızları CSV İndir
                      </Button>
                      <Button variant="secondary" onClick={openFailedRecipientsInContacts} disabled={detailLoading}>
                        Kişilerde Temizle
                      </Button>
                      <Button variant="secondary" onClick={openFailedRecipientsSegmentModal} disabled={detailLoading}>
                        Segmente Aktar
                      </Button>
                      <Button onClick={addFailedRecipientsToSuppression} disabled={detailLoading || suppressionCandidateMessages.length === 0}>
                        Kara Listeye Ekle
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {failedDetailMessages.slice(0, 8).map((message) => (
                      <span key={message.id} className="rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold text-red-800">
                        {message.recipient}
                      </span>
                    ))}
                    {failedDetailMessages.length > 8 && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                        +{failedDetailMessages.length - 8} kayıt
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
                {detailLoading ? (
                  <LoadingState variant="table" rows={5} />
                ) : detailMessages.length > 0 ? (
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
                      {detailMessages.map((message) => (
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
                <Button variant="secondary" onClick={exportDetailCsv} disabled={detailLoading}>
                  CSV İndir
                </Button>
                <Button variant="secondary" onClick={exportFailedRecipientsCsv} disabled={detailLoading || failedDetailMessages.length === 0}>
                  Başarısızları CSV İndir
                </Button>
                <Button variant="secondary" onClick={openFailedRecipientsInContacts} disabled={detailLoading || failedDetailMessages.length === 0}>
                  Kişilerde Temizle
                </Button>
                <Button variant="secondary" onClick={openFailedRecipientsSegmentModal} disabled={detailLoading || failedDetailMessages.length === 0}>
                  Segmente Aktar
                </Button>
                <Button variant="secondary" onClick={addFailedRecipientsToSuppression} disabled={detailLoading || suppressionCandidateMessages.length === 0}>
                  Kara Listeye Ekle
                </Button>
                <Button variant="secondary" onClick={printDetailReport} disabled={detailLoading}>
                  PDF / Yazdır
                </Button>
                <Button variant="secondary" onClick={() => setDetailTarget(null)}>Kapat</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {segmentModalOpen && detailTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/40 p-4">
          <Card title="Başarısızları Segmente Aktar" className="w-full max-w-xl shadow-2xl">
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                Bu işlem başarısız numaralarla CRM kişi listesinde eşleşen kayıtların segmentini günceller. Eşleşmeyen numaralar için CSV veya kara liste akışını kullanabilirsiniz.
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Mevcut segment</label>
                <select
                  value={segmentGroupId}
                  onChange={(event) => setSegmentGroupId(event.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Yeni segment oluştur</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>

              {!segmentGroupId && (
                <Input
                  label="Yeni segment adı"
                  value={newSegmentName}
                  onChange={(event) => setNewSegmentName(event.target.value)}
                  placeholder="Kampanya Hatalı Numaralar"
                />
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <CancelMetric label="Başarısız alıcı" value={`${failedDetailMessages.length} kayıt`} />
                <CancelMetric label="Kampanya" value={detailTarget.name || detailTarget.id.slice(0, 8)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={assignFailedRecipientsToSegment} disabled={segmenting || (!segmentGroupId && !newSegmentName.trim())}>
                  {segmenting ? "Aktarılıyor..." : "Segmente Aktar"}
                </Button>
                <Button variant="secondary" onClick={() => setSegmentModalOpen(false)} disabled={segmenting}>
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

function messageStatusLabel(status: SmsMessage["status"]) {
  if (status === "delivered") return "Teslim edildi"
  if (status === "sent") return "Gönderildi"
  if (status === "failed") return "Hata"
  return "Bekliyor"
}

function messageStatusTone(status: SmsMessage["status"]) {
  if (status === "delivered" || status === "sent") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

function ReportMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "red" | "amber" }) {
  const classes = {
    slate: "border-gray-200 bg-white text-gray-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    red: "border-red-200 bg-red-50 text-red-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  }

  return (
    <div className={`rounded-xl border p-4 ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function SummaryBox({ title, value, tone = "neutral" }: { title: string; value: number | string; tone?: "neutral" | "success" | "danger" | "warning" }) {
  const classes = {
    neutral: "border-gray-200 bg-white text-gray-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    danger: "border-red-200 bg-red-50 text-red-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  }

  return (
    <div className={`rounded-lg border p-3 ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{title}</p>
      <p className="mt-1 text-xl font-semibold">{typeof value === "number" ? value.toLocaleString("tr-TR") : value}</p>
    </div>
  )
}

function ProviderErrorBox({ code, count, info }: { code: string; count: number; info: ReturnType<typeof getProviderErrorInfo> }) {
  if (!info) return null

  const classes = {
    warning: "border-amber-200 bg-white text-amber-950",
    danger: "border-red-200 bg-white text-red-950",
    info: "border-blue-200 bg-white text-blue-950",
  }

  return (
    <div className={`rounded-lg border p-3 ${classes[info.severity]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold">{code}</p>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{count} kayıt</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{info.title}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{info.description}</p>
      <p className="mt-2 text-xs font-medium">{info.action}</p>
    </div>
  )
}

function ProviderErrorInline({ providerName, code }: { providerName?: string | null; code?: string | null }) {
  const info = getProviderErrorInfo(providerName, code)
  if (!info) return <span className="text-xs text-gray-500">-</span>

  return (
    <div>
      <p className="text-xs font-semibold text-gray-950">{info.title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{info.action}</p>
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
