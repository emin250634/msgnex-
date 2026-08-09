"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import type { CompanyAuditLog, CompanyWebhook } from "@/types"

type NotificationSeverity = "critical" | "warning" | "info" | "success"

interface NotificationItem {
  id: string
  severity: NotificationSeverity
  category: string
  title: string
  description: string
  href: string
  action: string
  createdAt?: string | null
}

function severityLabel(severity: NotificationSeverity) {
  if (severity === "critical") return "Kritik"
  if (severity === "warning") return "Uyarı"
  if (severity === "success") return "Temiz"
  return "Bilgi"
}

function severityTone(severity: NotificationSeverity) {
  if (severity === "critical") return "danger" as const
  if (severity === "warning") return "warning" as const
  if (severity === "success") return "success" as const
  return "info" as const
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function isOlderThanHours(value: string | null | undefined, hours: number) {
  if (!value) return false
  return Date.now() - new Date(value).getTime() > hours * 60 * 60 * 1000
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [plan, setPlan] = useState<{ company_id: string; plan: CompanyPlan; has_api_access: boolean; has_webhook: boolean } | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data: planRows, error: planError } = await supabase.rpc("get_customer_plan")

    if (planError) {
      setError(planError.message)
      setLoading(false)
      return
    }

    const currentPlan = planRows?.[0] ?? null
    setPlan(currentPlan)
    if (!currentPlan?.company_id) {
      setNotifications([])
      setLoading(false)
      return
    }

    const companyId = currentPlan.company_id
    const last30Start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
    const last7Start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString()

    const [
      { data: providerRows },
      { data: webhookRows, error: webhookError },
      { data: auditRows, error: auditError },
      { count: messagesLast30 },
      { count: failedMessagesLast30 },
      { count: awaitingDlr },
      { count: reviewRequired },
      { count: unknownConsent },
      { count: optedOut },
      { count: suppressionTotal },
    ] = await Promise.all([
      supabase.rpc("get_customer_provider_status"),
      supabase.rpc("list_company_webhooks"),
      supabase.rpc("list_company_audit_logs"),
      supabase.from("sms_messages").select("*", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", last30Start),
      supabase.from("sms_messages").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "failed").gte("created_at", last30Start),
      supabase.from("sms_campaigns").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("provider_status", "awaiting_dlr"),
      supabase.from("sms_campaigns").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "review_required"),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("consent_status", "unknown"),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("consent_status", "opted_out"),
      supabase.from("suppression_list").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    ])

    const provider = providerRows?.[0]
    const hasProvider = Boolean(provider?.has_provider)
    const providerReady = Boolean(provider?.has_provider && provider.sender_header && provider.connection_status !== "disabled")
    const generated: NotificationItem[] = []

    if (!providerReady) {
      generated.push({
        id: "provider-not-ready",
        severity: "critical",
        category: "Provider",
        title: "Provider bağlantısı gönderime hazır değil",
        description: "SMS gönderimi için Netgsm bağlantısı, kullanıcı bilgileri ve onaylı başlık tamamlanmalı.",
        href: "/provider",
        action: "Provider Ayarlarını Aç",
      })
    }

    if (hasProvider && !provider?.sender_header) {
      generated.push({
        id: "sender-header-missing",
        severity: "critical",
        category: "Başlık",
        title: "Onaylı gönderici başlığı eksik",
        description: "Firma panelden başlık değiştiremez; sağlayıcıdan gelen onaylı başlık seçilmeden güvenli gönderim yapılmamalı.",
        href: "/provider",
        action: "Başlıkları Kontrol Et",
      })
    }

    if (provider?.last_synced_at && isOlderThanHours(provider.last_synced_at, 24)) {
      generated.push({
        id: "provider-sync-stale",
        severity: "warning",
        category: "Provider",
        title: "Provider senkronu eski",
        description: `Son provider senkronu ${formatDate(provider.last_synced_at)} tarihinde yapılmış. Bakiye ve başlık görünürlüğünü yenilemek iyi olur.`,
        href: "/provider",
        action: "Senkronu Yenile",
        createdAt: provider.last_synced_at,
      })
    }

    const providerBalance = typeof provider?.balance === "number" ? provider.balance : provider?.balance ? Number(provider.balance) : null
    if (providerBalance !== null && providerBalance <= 100) {
      generated.push({
        id: "provider-balance-low",
        severity: "warning",
        category: "Provider",
        title: "Sağlayıcı bakiyesi düşük görünüyor",
        description: `Son senkrona göre sağlayıcı bakiyesi ${providerBalance.toLocaleString("tr-TR")} ${provider?.balance_unit || "sms"}. Bakiye sağlayıcı hesabından yenilenir.`,
        href: "/provider",
        action: "Provider Durumunu Aç",
      })
    }

    if (!webhookError || !String(webhookError.message).includes("Webhook access requires")) {
      const failedWebhooks = ((webhookRows ?? []) as CompanyWebhook[]).filter((webhook) => webhook.last_delivery_status === "failed")
      if (failedWebhooks.length > 0) {
        generated.push({
          id: "webhook-failed",
          severity: "critical",
          category: "Webhook",
          title: "Hatalı webhook delivery var",
          description: `${failedWebhooks.length} webhook için son delivery denemesi hatalı. Endpoint, imza doğrulama veya sunucu yanıtı kontrol edilmeli.`,
          href: "/webhooks",
          action: "Webhookları İncele",
        })
      }
    }

    if (!auditError) {
      const rateLimitLogs = ((auditRows ?? []) as CompanyAuditLog[]).filter(
        (log) => log.action === "api.rate_limited" && new Date(log.created_at) >= new Date(last7Start)
      )
      if (rateLimitLogs.length > 0) {
        generated.push({
          id: "api-rate-limited",
          severity: "warning",
          category: "API",
          title: "API rate limit aşımı yaşandı",
          description: `Son 7 günde ${rateLimitLogs.length} rate limit olayı kaydedildi. Entegrasyon retry/backoff davranışı ve paket limiti kontrol edilmeli.`,
          href: "/audit-logs",
          action: "Audit Logları Aç",
          createdAt: rateLimitLogs[0]?.created_at,
        })
      }
    }

    const totalMessages = messagesLast30 ?? 0
    const failedMessages = failedMessagesLast30 ?? 0
    const failedRate = totalMessages > 0 ? Math.round((failedMessages / totalMessages) * 100) : 0
    if (failedMessages >= 5 && failedRate >= 10) {
      generated.push({
        id: "campaign-failure-rate",
        severity: "critical",
        category: "Kampanya",
        title: "Son 30 gün hata oranı yüksek",
        description: `Son 30 günde ${failedMessages} hatalı SMS var. Hata oranı yaklaşık %${failedRate}. Numara temizliği ve provider hata kodları incelenmeli.`,
        href: "/campaigns",
        action: "Kampanya Raporlarını Aç",
      })
    } else if (failedMessages > 0) {
      generated.push({
        id: "campaign-failures-exist",
        severity: "warning",
        category: "Kampanya",
        title: "Temizlik bekleyen hatalı SMS kayıtları var",
        description: `Son 30 günde ${failedMessages} hatalı SMS var. Başarısız numaralar CSV, kara liste veya segment akışına taşınabilir.`,
        href: "/campaigns",
        action: "Hataları İncele",
      })
    }

    if ((awaitingDlr ?? 0) > 0) {
      generated.push({
        id: "awaiting-dlr",
        severity: "info",
        category: "Kampanya",
        title: "DLR bekleyen kampanyalar var",
        description: `${awaitingDlr} kampanya sağlayıcı teslimat raporu bekliyor.`,
        href: "/campaigns",
        action: "Kampanyaları Aç",
      })
    }

    if ((reviewRequired ?? 0) > 0) {
      generated.push({
        id: "review-required",
        severity: "warning",
        category: "Kampanya",
        title: "İnceleme gerektiren kampanya var",
        description: `${reviewRequired} kampanya gönderim öncesi veya sonrası kontrol gerektiriyor.`,
        href: "/campaigns",
        action: "İncele",
      })
    }

    if ((unknownConsent ?? 0) > 0) {
      generated.push({
        id: "unknown-consent",
        severity: "warning",
        category: "KVKK",
        title: "İzin durumu bilinmeyen kişiler var",
        description: `${unknownConsent} kişinin ticari ileti izin durumu bilinmiyor. Gönderim kalitesi için izin bilgilerini netleştirin.`,
        href: "/contacts",
        action: "Kişileri Aç",
      })
    }

    if ((optedOut ?? 0) > 0 || (suppressionTotal ?? 0) > 0) {
      generated.push({
        id: "suppression-active",
        severity: "info",
        category: "KVKK",
        title: "Gönderimden çıkarılacak kayıtlar mevcut",
        description: `${optedOut ?? 0} izinsiz kişi ve ${suppressionTotal ?? 0} kara liste kaydı gönderimlerde otomatik dışarıda bırakılır.`,
        href: "/suppression",
        action: "Kara Listeyi Aç",
      })
    }

    if (generated.length === 0) {
      generated.push({
        id: "all-clear",
        severity: "success",
        category: "Sistem",
        title: "Kritik uyarı yok",
        description: "Provider, kampanya, API ve uyumluluk görünümünde şu anda aksiyon gerektiren bir durum görünmüyor.",
        href: "/dashboard",
        action: "Dashboarda Dön",
      })
    }

    setNotifications(generated)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const categoryOptions = useMemo(
    () => Array.from(new Set(notifications.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "tr")),
    [notifications]
  )
  const filteredNotifications = notifications.filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false
    if (severityFilter !== "all" && item.severity !== severityFilter) return false
    return true
  })
  const counts = {
    critical: notifications.filter((item) => item.severity === "critical").length,
    warning: notifications.filter((item) => item.severity === "warning").length,
    info: notifications.filter((item) => item.severity === "info").length,
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Bildirimler" description="Firma operasyonundaki aksiyon gerektiren durumları tek ekrandan takip edin." />
        <LoadingState variant="table" rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Bildirimler" description="Firma operasyonundaki aksiyon gerektiren durumları tek ekrandan takip edin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bildirimler"
        description={`Firma operasyonundaki aksiyon gerektiren durumları tek ekrandan takip edin. Mevcut plan: ${plan ? PLAN_LABELS[plan.plan] : "-"}`}
        actions={<Button variant="secondary" onClick={load}>Yenile</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryBox title="Kritik" value={counts.critical} tone="danger" />
        <SummaryBox title="Uyarı" value={counts.warning} tone="warning" />
        <SummaryBox title="Bilgi" value={counts.info} tone="info" />
      </div>

      <Card title="Filtreler">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Kategori</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-900"
            >
              <option value="all">Tüm kategoriler</option>
              {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Önem</span>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-900"
            >
              <option value="all">Tüm önem seviyeleri</option>
              <option value="critical">Kritik</option>
              <option value="warning">Uyarı</option>
              <option value="info">Bilgi</option>
              <option value="success">Temiz</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="Sistem Uyarıları">
        {filteredNotifications.length > 0 ? (
          <div className="space-y-3">
            {filteredNotifications.map((item) => (
              <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={severityLabel(item.severity)} tone={severityTone(item.severity)} />
                      <StatusBadge label={item.category} tone="neutral" />
                      {item.createdAt && <span className="text-xs text-gray-500">{formatDate(item.createdAt)}</span>}
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-gray-950">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{item.description}</p>
                  </div>
                  <Link href={item.href} className="shrink-0">
                    <Button variant={item.severity === "critical" ? "primary" : "secondary"} size="sm">{item.action}</Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Filtreye uygun bildirim yok"
            description="Kategori veya önem filtresini değiştirerek diğer uyarıları görüntüleyebilirsiniz."
            action={<Button variant="secondary" onClick={() => { setCategoryFilter("all"); setSeverityFilter("all") }}>Filtreleri Temizle</Button>}
          />
        )}
      </Card>
    </div>
  )
}

function SummaryBox({ title, value, tone }: { title: string; value: number; tone: "danger" | "warning" | "info" }) {
  const classes = {
    danger: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  }

  return (
    <div className={`rounded-lg border p-4 ${classes[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}
