import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { createClient } from "@/lib/supabase/server"

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
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

function txTypeLabel(type: string) {
  if (type === "refund") return "İade"
  if (type === "deduct") return "Kullanım"
  if (type === "purchase") return "Satın Alma"
  return "Yükleme"
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
  let creditsBalance = 0
  let contactCount = 0
  let segmentCount = 0
  let vipCustomerCount = 0
  let emailCustomerCount = 0
  let campaignCount = 0
  let awaitingDlrCount = 0
  let providerFailedCount = 0
  let reviewRequiredCount = 0
  let recentMessages: any[] = []
  let recentFailedMessages: any[] = []
  let recentCampaigns: any[] = []
  let recentTransactions: any[] = []

  if (activeCompanyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", activeCompanyId)
      .single()
    companyName = company?.name || "-"

    const { data: credits } = await supabase
      .from("sms_credits")
      .select("balance")
      .eq("company_id", activeCompanyId)
      .single()
    creditsBalance = credits?.balance ?? 0

    const { count: contactsTotal } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("company_id", activeCompanyId)
    contactCount = contactsTotal ?? 0

    const { data: crmContacts } = await supabase
      .from("contacts")
      .select("group_id,email")
      .eq("company_id", activeCompanyId)

    const { data: crmGroups } = await supabase
      .from("groups")
      .select("id,name")
      .eq("company_id", activeCompanyId)

    segmentCount = crmGroups?.length ?? 0
    const vipGroupIds = new Set((crmGroups ?? [])
      .filter((group) => String(group.name || "").toLowerCase().includes("vip"))
      .map((group) => group.id))
    vipCustomerCount = (crmContacts ?? []).filter((contact) => contact.group_id && vipGroupIds.has(contact.group_id)).length
    emailCustomerCount = (crmContacts ?? []).filter((contact) => Boolean(contact.email)).length

    const { count: campaignsTotal } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", activeCompanyId)
    campaignCount = campaignsTotal ?? 0

    const { count: awaitingDlr } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", activeCompanyId)
      .eq("provider_status", "awaiting_dlr")
    awaitingDlrCount = awaitingDlr ?? 0

    const { count: providerFailed } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", activeCompanyId)
      .eq("provider_status", "failed")
    providerFailedCount = providerFailed ?? 0

    const { count: reviewRequired } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", activeCompanyId)
      .eq("status", "review_required")
    reviewRequiredCount = reviewRequired ?? 0

    const { data: messages } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("company_id", activeCompanyId)
      .order("created_at", { ascending: false })
      .limit(6)
    recentMessages = messages ?? []

    const { data: failedMessages } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("company_id", activeCompanyId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(4)
    recentFailedMessages = failedMessages ?? []

    const { data: campaigns } = await supabase
      .from("sms_campaigns")
      .select("*")
      .eq("company_id", activeCompanyId)
      .order("created_at", { ascending: false })
      .limit(5)
    recentCampaigns = campaigns ?? []

    const { data: transactions } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("company_id", activeCompanyId)
      .order("created_at", { ascending: false })
      .limit(5)
    recentTransactions = transactions ?? []
  }

  const successRate = recentMessages.length > 0
    ? Math.round((recentMessages.filter((message) => message.status === "sent" || message.status === "delivered").length / recentMessages.length) * 100)
    : 0

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
        {creditsBalance < 100 && (
          <Link href="/balance" className="rounded-xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100">
            <p className="text-sm font-semibold text-amber-900">Düşük bakiye</p>
            <p className="mt-1 text-sm text-amber-800">Kalan kredi {creditsBalance}. Gönderim kesintisi yaşamamak için bakiye kontrolü önerilir.</p>
          </Link>
        )}
        {awaitingDlrCount > 0 && (
          <Link href="/campaigns" className="rounded-xl border border-blue-200 bg-blue-50 p-4 transition-colors hover:bg-blue-100">
            <p className="text-sm font-semibold text-blue-900">DLR bekleyen kampanya</p>
            <p className="mt-1 text-sm text-blue-800">{awaitingDlrCount} kampanya teslimat raporu bekliyor.</p>
          </Link>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard title="Bakiye" value={creditsBalance} description="Kullanılabilir SMS kredisi" tone="blue" icon={<span className="font-semibold">₺</span>} trend={<MiniTrend tone="blue" />} />
        <StatCard title="Kişiler" value={contactCount} description="Toplam kayıtlı kişi" tone="emerald" icon={<span className="font-semibold">KŞ</span>} trend={<MiniTrend tone="green" />} />
        <StatCard title="Kampanyalar" value={campaignCount} description="Toplam kampanya" tone="slate" icon={<span className="font-semibold">KP</span>} trend={<MiniTrend tone="purple" />} />
        <StatCard title="Teslimat Oranı" value={`%${successRate}`} description="Son kayıtlar üzerinden özet" tone="amber" icon={<span className="font-semibold">OK</span>} trend={<MiniTrend tone="orange" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DashboardMetric title="VIP Müşteri" value={vipCustomerCount} description="VIP segmentindeki kayıtlar" tone="purple" />
        <DashboardMetric title="Segmentler" value={segmentCount} description="Aktif grup/segment sayısı" tone="info" />
        <DashboardMetric title="Çok Kanallı Kayıt" value={emailCustomerCount} description="E-posta bilgisi bulunan kişiler" tone="success" />
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusMetric title="DLR Bekleyen" value={awaitingDlrCount} description="Teslimat raporu bekleyen" tone="red" />
          <StatusMetric title="Provider Hatası" value={providerFailedCount} description="Hata alan kampanyalar" tone="orange" />
          <StatusMetric title="İnceleme Gereken" value={reviewRequiredCount} description="Operasyon kontrolü gereken" tone="violet" />
          <StatusMetric title="Sistem Sağlığı" value="Hazır" description="Panel akışı aktif, provider ayarı bekleniyor" tone="emerald" />
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

        <Card title="Provider Durumu">
          <div className="space-y-4">
            {[
              ["Provider", "Henüz yapılandırılmadı", "Firma bazlı Netgsm bağlantısı backend entegrasyonu sonrası gösterilecek."],
              ["DLR", "Gerçek bağlantı bekleniyor", "Teslimat raporu görünümü provider/DLR worker bağlandıktan sonra aktif olacak."],
              ["Gönderim Kuyruğu", "Sistem hazır, provider bekleniyor", "Kampanya kuyruğu mevcut; canlı gönderim için firma provider ayarı gerekir."],
            ].map(([label, status, description]) => (
              <div key={label} className="grid gap-3 rounded-xl border border-gray-100 p-4 text-sm md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-semibold text-gray-950">{label}</p>
                  <p className="mt-1 text-sm text-gray-500">{description}</p>
                </div>
                <StatusBadge label={String(status)} tone="warning" />
              </div>
            ))}
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
            <QuickAction href="/balance" label="Bakiye" icon="₺" />
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

      <Card title="Son Kredi Hareketleri">
        {recentTransactions.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-950">{txTypeLabel(transaction.type)}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{transaction.note || formatDate(transaction.created_at)}</p>
                </div>
                <p className={transaction.amount >= 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>
                  {transaction.amount > 0 ? "+" : ""}{transaction.amount}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Kredi hareketi yok" description="Kredi işlemleri burada görünecek." />
        )}
      </Card>
    </div>
  )
}

function DashboardMetric({ title, value, description, tone }: { title: string; value: number; description: string; tone: "purple" | "info" | "success" }) {
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
