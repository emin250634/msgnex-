import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

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
      {[28, 36, 31, 44, 38, 52, 58].map((height, index) => (
        <span key={index} className={`w-full rounded-t ${colors[tone]}/25`} style={{ height }} />
      ))}
    </div>
  )
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  const { count: companyCount } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })

  const { count: userCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })

  const { count: smsCount } = await supabase
    .from("sms_messages")
    .select("*", { count: "exact", head: true })

  const { count: campaignCount } = await supabase
    .from("sms_campaigns")
    .select("*", { count: "exact", head: true })

  const { count: awaitingDlrCount } = await supabase
    .from("sms_campaigns")
    .select("*", { count: "exact", head: true })
    .eq("provider_status", "awaiting_dlr")

  const { count: providerFailedCount } = await supabase
    .from("sms_campaigns")
    .select("*", { count: "exact", head: true })
    .eq("provider_status", "failed")

  const { count: reviewRequiredCount } = await supabase
    .from("sms_campaigns")
    .select("*", { count: "exact", head: true })
    .eq("status", "review_required")

  const { data: recentCompanies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)

  const { data: recentCampaigns } = await supabase
    .from("sms_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)

  return (
    <div className="space-y-7">
      <PageHeader
        title="Admin Dashboard"
        description="Platform genel durumu, provider görünürlüğü ve operasyon kontrol merkezi."
      />

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard title="Firmalar" value={companyCount ?? 0} description="Kayıtlı firma" tone="blue" icon={<span className="font-semibold">FR</span>} trend={<MiniTrend tone="blue" />} />
        <StatCard title="Kullanıcılar" value={userCount ?? 0} description="Platform kullanıcıları" tone="emerald" icon={<span className="font-semibold">KU</span>} trend={<MiniTrend tone="green" />} />
        <StatCard title="Kampanyalar" value={campaignCount ?? 0} description="Toplam kampanya" tone="slate" icon={<span className="font-semibold">KP</span>} trend={<MiniTrend tone="purple" />} />
        <StatCard title="Toplam SMS" value={smsCount ?? 0} description="Oluşturulan SMS kaydı" tone="amber" icon={<span className="font-semibold">SMS</span>} trend={<MiniTrend tone="orange" />} />
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">DLR Bekleyen</p>
            <p className="mt-2 text-3xl font-semibold text-red-900">{awaitingDlrCount ?? 0}</p>
            <p className="mt-1 text-xs text-red-700">Teslimat raporu bekleyen</p>
          </div>
          <div className="rounded-xl bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">Provider Hatası</p>
            <p className="mt-2 text-3xl font-semibold text-orange-900">{providerFailedCount ?? 0}</p>
            <p className="mt-1 text-xs text-orange-700">Hata alan kampanyalar</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm font-semibold text-violet-800">İnceleme Gereken</p>
            <p className="mt-2 text-3xl font-semibold text-violet-900">{reviewRequiredCount ?? 0}</p>
            <p className="mt-1 text-xs text-violet-700">Operasyon kontrolü gereken</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Sistem Sağlığı</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-900">Panel Hazır</p>
            <p className="mt-1 text-xs text-emerald-700">Provider bağlantısı ayrıca doğrulanmalıdır</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Son Kampanyalar">
          {recentCampaigns && recentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr><th className="pb-3">Kampanya</th><th className="pb-3">Tarih</th><th className="pb-3">Provider</th><th className="pb-3">Durum</th><th className="pb-3 text-right">Alıcı</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="py-3 font-medium text-gray-950">{campaign.name || campaign.message?.slice(0, 34) || "Kampanya"}</td>
                      <td className="py-3 text-gray-500">{formatDate(campaign.created_at)}</td>
                      <td className="py-3 text-gray-700">{campaign.provider_name || "-"}</td>
                      <td className="py-3"><StatusBadge label={campaign.status} tone={campaign.status === "failed" ? "danger" : "info"} /></td>
                      <td className="py-3 text-right text-gray-700">{campaign.total_recipients}</td>
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
              ["NETGSM", "Firma ayarı bekleniyor", smsCount ?? 0, Math.max((smsCount ?? 0) - (providerFailedCount ?? 0), 0), providerFailedCount ?? 0],
              ["DLR Servisi", "Entegrasyon bekleniyor", awaitingDlrCount ?? 0, Math.max((awaitingDlrCount ?? 0) - (providerFailedCount ?? 0), 0), providerFailedCount ?? 0],
              ["Gönderim Kuyruğu", "Worker doğrulaması gerekli", campaignCount ?? 0, Math.max((campaignCount ?? 0) - (reviewRequiredCount ?? 0), 0), reviewRequiredCount ?? 0],
            ].map(([label, status, total, success, fail]) => (
              <div key={label} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-xl border border-gray-100 p-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-950">{label}</p>
                  <StatusBadge label={String(status)} tone="warning" className="mt-2" />
                </div>
                <div className="text-right"><p className="text-xs text-gray-500">Gönderim</p><p className="font-semibold text-gray-900">{Number(total)}</p></div>
                <div className="text-right"><p className="text-xs text-gray-500">Başarılı</p><p className="font-semibold text-emerald-700">{Number(success)}</p></div>
                <div className="text-right"><p className="text-xs text-gray-500">Hata</p><p className="font-semibold text-red-700">{Number(fail)}</p></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Son Eklenen Firmalar">
          {recentCompanies && recentCompanies.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {recentCompanies.map((company) => (
                <div key={company.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-950">{company.name}</p>
                    <p className="mt-1 text-sm text-gray-500">{company.phone || "Telefon bilgisi yok"}</p>
                  </div>
                  <StatusBadge label={company.is_active ? "Aktif" : "Pasif"} tone={company.is_active ? "success" : "danger"} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Henüz firma yok" description="Yeni firmalar eklendiğinde bu alanda son kayıtlar görünecek." />
          )}
        </Card>

        <Card title="Hızlı İşlemler">
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickAction href="/admin/companies" label="Firma Yönetimi" icon="+" />
            <QuickAction href="/admin/credits" label="Kredi Yönetimi" icon="₺" />
            <QuickAction href="/admin/logs" label="Gönderim Kayıtları" icon="▤" />
            <QuickAction href="/admin/users" label="Kullanıcılar" icon="◎" />
          </div>
        </Card>
      </div>
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
