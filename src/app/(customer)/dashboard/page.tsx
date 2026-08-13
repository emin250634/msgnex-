import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/server"

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function messageStatusLabel(status: string) {
  if (status === "sent") return "Gönderildi"
  if (status === "delivered") return "Teslim edildi"
  if (status === "failed") return "Hata"
  return "Bekliyor"
}

function messageStatusTone(status: string) {
  if (status === "sent" || status === "delivered") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

function campaignStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Kuyrukta",
    sending: "Gönderiliyor",
    completed: "Tamamlandı",
    failed: "Hata",
    cancelled: "İptal",
    review_required: "İnceleme",
    draft: "Taslak",
    scheduled: "Planlandı",
  }
  return labels[status] || status
}

function campaignStatusTone(status: string) {
  if (status === "completed") return "success" as const
  if (status === "failed") return "danger" as const
  if (status === "queued" || status === "sending") return "warning" as const
  return "info" as const
}

type DashboardSummary = Record<string, any>

function numberValue(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function arrayValue<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function MiniTrend({ tone = "blue" }: { tone?: "blue" | "green" | "orange" | "purple" }) {
  const colors = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    orange: "bg-orange-500",
    purple: "bg-violet-500",
  }

  return (
    <div className="flex h-10 items-end gap-1.5">
      {[26, 34, 30, 42, 36, 48, 56].map((height, index) => (
        <span key={index} className={`w-full rounded-t ${colors[tone]}/25`} style={{ height }} />
      ))}
    </div>
  )
}

export default async function CustomerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "admin") redirect("/admin/dashboard")

  const { data: activeMembership } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle()

  const activeCompanyId = activeMembership?.company_id

  let companyName = "-"
  let companyPlan: CompanyPlan = "starter"
  let providerName = "Netgsm"
  let providerStatus = "Kurulum bekliyor"
  let providerReady = false
  let providerConnectionStatus = "not_configured"
  let providerSenderHeader: string | null = null
  let providerSenderHeaderStatus = "unknown"
  let providerBalance: number | null = null
  let providerBalanceUnit = "sms"
  let providerLastSyncedAt: string | null = null
  let contactCount = 0
  let optedInCount = 0
  let optedOutCount = 0
  let unknownConsentCount = 0
  let suppressionCount = 0
  let segmentCount = 0
  let vipCustomerCount = 0
  let emailCustomerCount = 0
  let campaignCount = 0
  let campaignsLast30Count = 0
  let awaitingDlrCount = 0
  let providerFailedCount = 0
  let reviewRequiredCount = 0
  let messagesLast30Count = 0
  let sentMessagesLast30Count = 0
  let deliveredMessagesLast30Count = 0
  let failedMessagesLast30Count = 0
  let pendingMessagesLast30Count = 0
  let recentMessages: any[] = []
  let recentFailedMessages: any[] = []
  let recentCampaigns: any[] = []

  if (activeCompanyId) {
    const { data: summaryData, error: summaryError } = await supabase.rpc("get_customer_dashboard_summary")
    if (summaryError) {
      console.error("[customer-dashboard:summary]", { userId: user.id, companyId: activeCompanyId, error: summaryError })
    }

    const summary = (summaryData ?? {}) as DashboardSummary
    const company = summary.company ?? {}
    const provider = summary.provider ?? {}
    const contacts = summary.contacts ?? {}
    const segments = summary.segments ?? {}
    const campaigns = summary.campaigns ?? {}
    const messages = summary.messages ?? {}

    companyName = company.name || "-"
    companyPlan = (company.plan as CompanyPlan | null) || "starter"
    providerName = provider.provider_name || "Netgsm"
    providerConnectionStatus = provider.connection_status || "not_configured"
    providerSenderHeader = provider.sender_header || null
    providerSenderHeaderStatus = provider.sender_header_status || "unknown"
    providerBalance = provider.balance === null || provider.balance === undefined ? null : numberValue(provider.balance)
    providerBalanceUnit = provider.balance_unit || "sms"
    providerLastSyncedAt = provider.last_synced_at || null
    providerReady = Boolean(provider.has_provider && provider.sender_header && provider.connection_status !== "disabled")
    providerStatus = providerReady ? "Hazır" : "Kurulum bekliyor"
    contactCount = numberValue(contacts.total)
    optedInCount = numberValue(contacts.opted_in)
    optedOutCount = numberValue(contacts.opted_out)
    unknownConsentCount = numberValue(contacts.unknown_consent)
    suppressionCount = numberValue(contacts.suppression)
    segmentCount = numberValue(segments.total)
    vipCustomerCount = numberValue(segments.vip_customers)
    emailCustomerCount = numberValue(contacts.email_customers)
    campaignCount = numberValue(campaigns.total)
    campaignsLast30Count = numberValue(campaigns.last30)
    awaitingDlrCount = numberValue(campaigns.awaiting_dlr)
    providerFailedCount = numberValue(campaigns.provider_failed)
    reviewRequiredCount = numberValue(campaigns.review_required)
    messagesLast30Count = numberValue(messages.last30)
    sentMessagesLast30Count = numberValue(messages.sent_last30)
    deliveredMessagesLast30Count = numberValue(messages.delivered_last30)
    failedMessagesLast30Count = numberValue(messages.failed_last30)
    pendingMessagesLast30Count = numberValue(messages.pending_last30)
    recentMessages = arrayValue(summary.recent_messages)
    recentFailedMessages = arrayValue(summary.recent_failed_messages)
    recentCampaigns = arrayValue(summary.recent_campaigns)
  }

  const successRate = percent(sentMessagesLast30Count + deliveredMessagesLast30Count, messagesLast30Count)
  const failedRate = percent(failedMessagesLast30Count, messagesLast30Count)
  const consentRate = percent(optedInCount, contactCount)
  const providerChecklist = [
    { label: "Provider kaydı", done: providerConnectionStatus !== "not_configured" && providerConnectionStatus !== "disabled" },
    { label: "Onaylı başlık", done: Boolean(providerSenderHeader) && providerSenderHeaderStatus !== "rejected" },
    { label: "Bağlantı aktif", done: providerReady },
    { label: "Bakiye senkronu", done: Boolean(providerLastSyncedAt) },
  ]
  const healthIssues = [
    !providerReady ? "Provider bağlantısı tamamlanmadı" : null,
    optedOutCount > 0 ? `${optedOutCount} izinsiz kişi gönderimden çıkarılır` : null,
    unknownConsentCount > 0 ? `${unknownConsentCount} kişinin izin durumu bilinmiyor` : null,
    suppressionCount > 0 ? `${suppressionCount} kara liste kaydı aktif` : null,
    failedMessagesLast30Count > 0 ? `Son 30 günde ${failedMessagesLast30Count} hatalı SMS var` : null,
    awaitingDlrCount > 0 ? `${awaitingDlrCount} kampanya DLR bekliyor` : null,
    reviewRequiredCount > 0 ? `${reviewRequiredCount} kampanya inceleme gerektiriyor` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-7">
      <PageHeader
        title="Dashboard"
        description={`${companyName} için SMS operasyon özeti ve hızlı erişimler.`}
        actions={<Link href="/sms"><Button className="bg-blue-700 hover:bg-blue-800">SMS Gönder</Button></Link>}
      />

      {!activeCompanyId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bu kullanıcı aktif bir firmaya bağlı değil veya davet kabul işlemi tamamlanmamış.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {!providerReady && (
          <Link href="/provider" className="rounded-xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100">
            <p className="text-sm font-semibold text-amber-900">Provider kurulumu bekliyor</p>
            <p className="mt-1 text-sm text-amber-800">SMS gönderimi için firmanızın Netgsm bağlantısı tamamlanmalıdır.</p>
          </Link>
        )}
        {failedMessagesLast30Count > 0 && (
          <Link href="/campaigns" className="rounded-xl border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100">
            <p className="text-sm font-semibold text-red-900">Temizlik bekleyen hatalar</p>
            <p className="mt-1 text-sm text-red-800">Son 30 günde {failedMessagesLast30Count} hatalı SMS var. Kampanya raporundan temizlik akışını başlatın.</p>
          </Link>
        )}
        {awaitingDlrCount > 0 && (
          <Link href="/campaigns" className="rounded-xl border border-blue-200 bg-blue-50 p-4 transition-colors hover:bg-blue-100">
            <p className="text-sm font-semibold text-blue-900">DLR bekleyen kampanya</p>
            <p className="mt-1 text-sm text-blue-800">{awaitingDlrCount} kampanya teslimat raporu bekliyor.</p>
          </Link>
        )}
        <Link href="/notifications" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50">
          <p className="text-sm font-semibold text-gray-950">Bildirim Merkezi</p>
          <p className="mt-1 text-sm text-gray-600">{healthIssues.length > 0 ? `${healthIssues.length} operasyon uyarısı gözden geçirilebilir.` : "Kritik uyarı görünmüyor."}</p>
        </Link>
        <Link href="/setup" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50">
          <p className="text-sm font-semibold text-gray-950">Kurulum Checklist</p>
          <p className="mt-1 text-sm text-gray-600">Pilot başlangıç adımlarını tek akışta takip edin.</p>
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard title="Plan" value={PLAN_LABELS[companyPlan]} description="Yazılım paketi" tone="slate" icon={<span className="font-semibold">PL</span>} trend={<MiniTrend tone="purple" />} />
        <StatCard title="Provider" value={providerName} description={providerStatus} tone="blue" icon={<span className="font-semibold">API</span>} trend={<MiniTrend tone="blue" />} />
        <StatCard title="Kişiler" value={contactCount} description="Toplam kayıtlı kişi" tone="emerald" icon={<span className="font-semibold">KŞ</span>} trend={<MiniTrend tone="green" />} />
        <StatCard title="Son 30 Gün" value={campaignsLast30Count} description={`${campaignCount} toplam kampanya`} tone="slate" icon={<span className="font-semibold">30</span>} trend={<MiniTrend tone="purple" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <DashboardMetric title="İzinli Kişi" value={optedInCount} description={`İzin oranı %${consentRate}`} tone="success" />
        <DashboardMetric title="İzinsiz Kişi" value={optedOutCount} description="Gönderimden çıkarılır" tone="danger" />
        <DashboardMetric title="Kara Liste" value={suppressionCount} description="Otomatik atlanan numara" tone="warning" />
        <DashboardMetric title="Segmentler" value={segmentCount} description={`${vipCustomerCount} VIP, ${emailCustomerCount} e-postalı`} tone="info" />
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusMetric title="Son 30 Gün SMS" value={messagesLast30Count} description={`${pendingMessagesLast30Count} bekleyen kayıt`} tone="violet" />
          <StatusMetric title="Başarı Oranı" value={`%${successRate}`} description={`${sentMessagesLast30Count + deliveredMessagesLast30Count} başarılı kayıt`} tone="emerald" />
          <StatusMetric title="Hata Oranı" value={`%${failedRate}`} description={`${failedMessagesLast30Count} hatalı SMS`} tone={failedMessagesLast30Count > 0 ? "red" : "emerald"} />
          <StatusMetric title="DLR Bekleyen" value={awaitingDlrCount} description={`${providerFailedCount} provider hatalı kampanya`} tone="orange" />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Son Kampanyalar">
          {recentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr><th className="pb-3">Kampanya</th><th className="pb-3">Tarih</th><th className="pb-3">Provider</th><th className="pb-3">Durum</th><th className="pb-3 text-right">Sonuç</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="py-3 font-medium text-gray-950">{campaign.name || campaign.message?.slice(0, 34) || "Kampanya"}</td>
                      <td className="py-3 text-gray-500">{formatDate(campaign.created_at)}</td>
                      <td className="py-3 text-gray-700">{campaign.provider_name || "-"}</td>
                      <td className="py-3"><StatusBadge label={campaignStatusLabel(campaign.status)} tone={campaignStatusTone(campaign.status)} /></td>
                      <td className="py-3 text-right text-gray-700">{campaign.success_count ?? 0} / {campaign.total_recipients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Kampanya yok" description="Son kampanyalar burada listelenecek." />
          )}
        </Card>

        <Card title="Operasyon Sağlığı">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-950">Provider Hazırlığı</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {providerSenderHeader ? `${providerSenderHeader} başlığı ile gönderim hazırlanıyor.` : "Gönderici başlığı henüz hazır görünmüyor."}
                  </p>
                </div>
                <StatusBadge label={providerReady ? "Hazır" : "Eksik"} tone={providerReady ? "success" : "warning"} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {providerChecklist.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-gray-700">{item.label}</span>
                    <StatusBadge label={item.done ? "Tamam" : "Eksik"} tone={item.done ? "success" : "warning"} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoBox title="Provider Bakiyesi" value={providerBalance === null ? "-" : providerBalance.toLocaleString("tr-TR")} description={providerBalance === null ? "Sağlayıcıdan henüz sorgulanmadı" : providerBalanceUnit} />
              <InfoBox title="Son Senkron" value={formatDate(providerLastSyncedAt)} description="Provider bakiye/başlık görünürlüğü" />
            </div>

            {healthIssues.length > 0 ? (
              <div className="space-y-2">
                {healthIssues.slice(0, 4).map((issue) => (
                  <div key={issue} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {issue}
                  </div>
                ))}
                <Link href="/notifications" className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900">
                  Tüm bildirimleri aç
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Operasyon görünümünde kritik uyarı yok.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Son Gönderimler">
          {recentMessages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr><th className="pb-3">Telefon</th><th className="pb-3">Mesaj</th><th className="pb-3">Provider</th><th className="pb-3">Durum</th><th className="pb-3">Tarih</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentMessages.map((message) => (
                    <tr key={message.id}>
                      <td className="py-3 font-medium text-gray-950">{message.recipient}</td>
                      <td className="max-w-xs truncate py-3 text-gray-600">{message.message}</td>
                      <td className="py-3 text-gray-700">{message.provider_name || "-"}</td>
                      <td className="py-3"><StatusBadge label={messageStatusLabel(message.status)} tone={messageStatusTone(message.status)} /></td>
                      <td className="py-3 text-gray-500">{formatDate(message.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Henüz SMS gönderimi yok" description="İlk kampanyanızı oluşturduğunuzda son gönderimler burada görünecek." />
          )}
        </Card>

        <Card title="Hızlı İşlemler">
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickAction href="/sms" label="SMS Gönder" icon="↗" />
            <QuickAction href="/contacts" label="Kişi Ekle" icon="+" />
            <QuickAction href="/groups" label="Grup Oluştur" icon="●" />
            <QuickAction href="/templates" label="Şablon Oluştur" icon="✎" />
            <QuickAction href="/campaigns" label="Kampanyalar" icon="▤" />
            <QuickAction href="/provider" label="Provider Bağlantısı" icon="API" />
          </div>
        </Card>
      </div>

      <Card title="Son Hatalı Gönderimler">
        {recentFailedMessages.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recentFailedMessages.map((message) => (
              <div key={message.id} className="rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="font-mono text-sm font-semibold text-red-900">{message.recipient}</p>
                <p className="mt-2 max-h-12 overflow-hidden text-sm text-red-800">{message.message}</p>
                <p className="mt-2 text-xs text-red-700">{message.provider_status_text || formatDate(message.failed_at || message.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Hatalı gönderim yok" description="Son hatalı gönderimler oluştuğunda burada görünecek." action={<Link href="/history"><Button variant="secondary">Geçmişi Aç</Button></Link>} />
        )}
      </Card>
    </div>
  )
}

function DashboardMetric({ title, value, description, tone }: { title: string; value: number; description: string; tone: "purple" | "info" | "success" | "danger" | "warning" }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-950">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{description}</p>
        </div>
        <StatusBadge label="CRM" tone={tone} />
      </div>
    </Card>
  )
}

function InfoBox({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{title}</p>
      <p className="mt-2 text-xl font-semibold text-gray-950">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  )
}

function StatusMetric({ title, value, description, tone }: { title: string; value: number | string; description: string; tone: "red" | "orange" | "violet" | "emerald" }) {
  const colors = {
    red: "bg-red-50 text-red-900",
    orange: "bg-orange-50 text-orange-900",
    violet: "bg-violet-50 text-violet-900",
    emerald: "bg-emerald-50 text-emerald-900",
  }

  return (
    <div className={`rounded-xl p-4 ${colors[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lg font-semibold text-blue-700">{icon}</span>
      <span className="text-sm font-semibold text-gray-950">{label}</span>
    </Link>
  )
}
