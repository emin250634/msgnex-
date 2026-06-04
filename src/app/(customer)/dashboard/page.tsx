import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

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

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
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
    .single()

  if (!profile || profile.role !== "customer") redirect("/login")

  let companyName = "-"
  let creditsBalance = 0
  let contactCount = 0
  let segmentCount = 0
  let vipCustomerCount = 0
  let emailCustomerCount = 0
  let smsCount = 0
  let campaignCount = 0
  let awaitingDlrCount = 0
  let providerFailedCount = 0
  let reviewRequiredCount = 0
  let recentMessages: any[] = []
  let recentCampaigns: any[] = []
  let recentTransactions: any[] = []

  if (profile.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .single()
    companyName = company?.name || "-"

    const { data: credits } = await supabase
      .from("sms_credits")
      .select("balance")
      .eq("company_id", profile.company_id)
      .single()
    creditsBalance = credits?.balance ?? 0

    const { count: cc } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
    contactCount = cc ?? 0

    const { data: crmContacts } = await supabase
      .from("contacts")
      .select("group_id,email")
      .eq("company_id", profile.company_id)

    const { data: crmGroups } = await supabase
      .from("groups")
      .select("id,name")
      .eq("company_id", profile.company_id)

    segmentCount = crmGroups?.length ?? 0
    const vipGroupIds = new Set((crmGroups ?? [])
      .filter((group) => String(group.name || "").toLowerCase().includes("vip"))
      .map((group) => group.id))
    vipCustomerCount = (crmContacts ?? []).filter((contact) => contact.group_id && vipGroupIds.has(contact.group_id)).length
    emailCustomerCount = (crmContacts ?? []).filter((contact) => Boolean(contact.email)).length

    const { count: sc } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
    smsCount = sc ?? 0

    const { count: campaignsTotal } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
    campaignCount = campaignsTotal ?? 0

    const { count: awaitingDlr } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .eq("provider_status", "awaiting_dlr")
    awaitingDlrCount = awaitingDlr ?? 0

    const { count: providerFailed } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .eq("provider_status", "failed")
    providerFailedCount = providerFailed ?? 0

    const { count: reviewRequired } = await supabase
      .from("sms_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .eq("status", "review_required")
    reviewRequiredCount = reviewRequired ?? 0

    const { data: msgs } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(6)
    recentMessages = msgs ?? []

    const { data: campaigns } = await supabase
      .from("sms_campaigns")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(5)
    recentCampaigns = campaigns ?? []

    const { data: transactions } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("company_id", profile.company_id)
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

      {!profile.company_id && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Firma bilgisi eksik. Lütfen admin ile iletişime geçin.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard title="Bakiye" value={creditsBalance} description="Kullanılabilir SMS kredisi" tone="blue" icon={<span className="font-semibold">₺</span>} trend={<MiniTrend tone="blue" />} />
        <StatCard title="Kişiler" value={contactCount} description="Toplam kayıtlı kişi" tone="emerald" icon={<span className="font-semibold">KŞ</span>} trend={<MiniTrend tone="green" />} />
        <StatCard title="Kampanyalar" value={campaignCount} description="Toplam kampanya" tone="slate" icon={<span className="font-semibold">KP</span>} trend={<MiniTrend tone="purple" />} />
        <StatCard title="Teslimat Oranı" value={`%${successRate}`} description="Son kayıtlar üzerinden özet" tone="amber" icon={<span className="font-semibold">✓</span>} trend={<MiniTrend tone="orange" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">VIP Müşteri</p>
              <p className="mt-2 text-3xl font-semibold text-gray-950">{vipCustomerCount}</p>
              <p className="mt-1 text-xs text-gray-500">VIP segmentindeki kayıtlar</p>
            </div>
            <StatusBadge label="CRM" tone="purple" />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">Segmentler</p>
              <p className="mt-2 text-3xl font-semibold text-gray-950">{segmentCount}</p>
              <p className="mt-1 text-xs text-gray-500">Aktif grup/segment sayısı</p>
            </div>
            <StatusBadge label="Hazır" tone="info" />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">Çok Kanallı Kayıt</p>
              <p className="mt-2 text-3xl font-semibold text-gray-950">{emailCustomerCount}</p>
              <p className="mt-1 text-xs text-gray-500">E-posta bilgisi bulunan kişiler</p>
            </div>
            <StatusBadge label="CRM" tone="success" />
          </div>
        </Card>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">DLR Bekleyen</p>
            <p className="mt-2 text-3xl font-semibold text-red-900">{awaitingDlrCount}</p>
            <p className="mt-1 text-xs text-red-700">Teslimat raporu bekleyen</p>
          </div>
          <div className="rounded-xl bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">Provider Hatası</p>
            <p className="mt-2 text-3xl font-semibold text-orange-900">{providerFailedCount}</p>
            <p className="mt-1 text-xs text-orange-700">Hata alan kampanyalar</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm font-semibold text-violet-800">İnceleme Gereken</p>
            <p className="mt-2 text-3xl font-semibold text-violet-900">{reviewRequiredCount}</p>
            <p className="mt-1 text-xs text-violet-700">Operasyon kontrolü gereken</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Sistem Sağlığı</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-900">Aktif</p>
            <p className="mt-1 text-xs text-emerald-700">Gönderim akışı hazır</p>
          </div>
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
              ["NETGSM", "Aktif", smsCount, Math.max(smsCount - providerFailedCount, 0), providerFailedCount],
              ["DLR Servisi", "Hazır", awaitingDlrCount, Math.max(awaitingDlrCount - providerFailedCount, 0), providerFailedCount],
              ["Gönderim Kuyruğu", "Aktif", campaignCount, Math.max(campaignCount - reviewRequiredCount, 0), reviewRequiredCount],
            ].map(([label, status, total, success, fail]) => (
              <div key={label} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-xl border border-gray-100 p-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-950">{label}</p>
                  <StatusBadge label={String(status)} tone="success" className="mt-2" />
                </div>
                <div className="text-right"><p className="text-xs text-gray-500">Gönderim</p><p className="font-semibold text-gray-900">{Number(total)}</p></div>
                <div className="text-right"><p className="text-xs text-gray-500">Başarılı</p><p className="font-semibold text-emerald-700">{Number(success)}</p></div>
                <div className="text-right"><p className="text-xs text-gray-500">Hata</p><p className="font-semibold text-red-700">{Number(fail)}</p></div>
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
            <QuickAction href="/groups" label="Grup Oluştur" icon="◎" />
            <QuickAction href="/templates" label="Şablon Oluştur" icon="✎" />
            <QuickAction href="/campaigns" label="Kampanyalar" icon="▤" />
            <QuickAction href="/balance" label="Bakiye" icon="₺" />
          </div>
        </Card>
      </div>

      <Card title="Son Kredi Hareketleri">
        {recentTransactions.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-950">{txTypeLabel(tx.type)}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{tx.note || formatDate(tx.created_at)}</p>
                </div>
                <p className={tx.amount >= 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
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

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lg font-semibold text-blue-700">{icon}</span>
      <span className="text-sm font-semibold text-gray-950">{label}</span>
    </Link>
  )
}
