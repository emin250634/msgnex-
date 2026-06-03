import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

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

  const { data: recentCompanies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Platform genel durumu, müşteri hareketleri ve operasyon özeti."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Firmalar"
          value={companyCount ?? 0}
          description="Kayıtlı firma"
          tone="blue"
          icon={<span className="text-sm font-semibold">FR</span>}
        />
        <StatCard
          title="Kullanıcılar"
          value={userCount ?? 0}
          description="Platform kullanıcıları"
          tone="emerald"
          icon={<span className="text-sm font-semibold">KU</span>}
        />
        <StatCard
          title="Toplam SMS"
          value={smsCount ?? 0}
          description="Oluşturulan SMS kaydı"
          tone="slate"
          icon={<span className="text-sm font-semibold">SMS</span>}
        />
      </div>

      <Card title="Son Eklenen Firmalar">
        {recentCompanies && recentCompanies.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentCompanies.map((company) => (
              <div key={company.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-950">{company.name}</p>
                  <p className="mt-1 text-sm text-gray-500">{company.phone || "Telefon bilgisi yok"}</p>
                </div>
                <StatusBadge
                  label={company.is_active ? "Aktif" : "Pasif"}
                  tone={company.is_active ? "success" : "danger"}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Henüz firma yok"
            description="Yeni firmalar eklendiğinde bu alanda son kayıtlar görünecek."
          />
        )}
      </Card>
    </div>
  )
}
