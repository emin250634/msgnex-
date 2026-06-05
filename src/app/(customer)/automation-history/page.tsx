import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

export default function AutomationHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Geçmişi"
        description="Çalıştırılan otomasyonlar ve aday sonuçları için hazırlık görünümü."
        actions={
          <>
            <Link href="/automation-queue"><Button variant="secondary">Kuyruğa Git</Button></Link>
            <Link href="/automations"><Button>Otomasyonlar</Button></Link>
          </>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Hazırlık Modu" tone="warning" />
          <span className="font-semibold">Gerçek otomasyon geçmişi henüz yok.</span>
        </div>
        <p className="mt-2">Sahte çalışma geçmişi gösterilmez. Backend hazır olduğunda gerçek run kayıtları burada listelenecek.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Toplam Aday" value={0} description="Gerçek kayıt yok" tone="blue" />
        <StatCard title="Onaylanan" value={0} description="Gerçek kayıt yok" tone="emerald" />
        <StatCard title="İncelenecek" value={0} description="Gerçek kayıt yok" tone="amber" />
      </div>

      <Card title="Çalışma Kayıtları">
        <EmptyState
          icon={<span className="text-2xl">OG</span>}
          title="Otomasyon geçmişi yok"
          description="automation_runs entegrasyonu yapılana kadar çalışma geçmişi boş gösterilir."
          action={<Link href="/automations"><Button variant="secondary">Otomasyonlara Git</Button></Link>}
        />
      </Card>
    </div>
  )
}
