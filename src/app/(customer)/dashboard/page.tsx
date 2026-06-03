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
  let smsCount = 0
  let recentMessages: any[] = []

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

    const { count: sc } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
    smsCount = sc ?? 0

    const { data: msgs } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(5)
    recentMessages = msgs ?? []
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${companyName} için SMS operasyon özeti ve hızlı erişimler.`}
        actions={
          <Link href="/sms">
            <Button>SMS Gönder</Button>
          </Link>
        }
      />

      {!profile.company_id && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Firma bilgisi eksik. Lütfen admin ile iletişime geçin.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="SMS Kredisi"
          value={creditsBalance}
          description="Kullanılabilir bakiye"
          tone="blue"
          icon={<span className="text-sm font-semibold">₺</span>}
        />
        <StatCard
          title="Kişi Sayısı"
          value={contactCount}
          description="Kayıtlı alıcı"
          tone="emerald"
          icon={<span className="text-sm font-semibold">KŞ</span>}
        />
        <StatCard
          title="Toplam SMS"
          value={smsCount}
          description="Oluşturulan gönderim kaydı"
          tone="slate"
          icon={<span className="text-sm font-semibold">SMS</span>}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <Card title="Son Gönderimler">
          {recentMessages.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-950">{msg.recipient}</p>
                    <p className="mt-1 max-w-xl truncate text-sm text-gray-500">{msg.message}</p>
                  </div>
                  <StatusBadge label={messageStatusLabel(msg.status)} tone={messageStatusTone(msg.status)} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Henüz SMS gönderimi yok"
              description="İlk kampanyanızı oluşturduğunuzda son gönderimler burada görünecek."
              action={
                <Link href="/sms">
                  <Button size="sm">İlk SMS&apos;i Gönder</Button>
                </Link>
              }
            />
          )}
        </Card>

        <Card title="Hızlı İşlemler">
          <div className="space-y-2">
            <Link href="/sms" className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-950">SMS Gönder</p>
              <p className="mt-1 text-sm text-gray-500">Tek veya toplu alıcıya kampanya oluşturun.</p>
            </Link>
            <Link href="/contacts" className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-950">Kişi Yönetimi</p>
              <p className="mt-1 text-sm text-gray-500">CSV ile alıcıları içe aktarın ve düzenleyin.</p>
            </Link>
            <Link href="/campaigns" className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-950">Kampanyalar</p>
              <p className="mt-1 text-sm text-gray-500">Kuyruk ve gönderim durumlarını takip edin.</p>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
