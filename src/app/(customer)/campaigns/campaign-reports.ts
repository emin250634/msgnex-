import { getProviderErrorInfo, providerErrorSummary } from "@/lib/provider-errors"
import type { SmsCampaign, SmsMessage } from "@/types"
import { getPhoneFormatIssue, phoneIssueSummary, type PhoneFormatIssue } from "./campaign-phone"
import {
  estimatedProviderUnits,
  formatDate,
  messageStatusLabel,
  providerStatusLabel,
  statusLabels,
} from "./campaign-utils"

function csvValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function fileSafeDate(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10)
  return value.slice(0, 10)
}

export function campaignReportFileName(campaign: SmsCampaign, extension: "csv" | "html") {
  const name = (campaign.name || "kampanya")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "kampanya"

  return `msgnex-${name}-${fileSafeDate(campaign.created_at)}.${extension}`
}

export function downloadTextFile(filename: string, content: string, type: string) {
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

export function buildCampaignReportCsv(campaign: SmsCampaign, messages: SmsMessage[]) {
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

export function buildFailedRecipientsCsv(campaign: SmsCampaign, messages: SmsMessage[]) {
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

export function buildCampaignReportHtml(campaign: SmsCampaign, messages: SmsMessage[]) {
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
