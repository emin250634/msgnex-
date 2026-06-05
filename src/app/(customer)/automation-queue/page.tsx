"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

export default function AutomationQueuePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Kuyruğu"
        description="Otomasyon adayları için güvenli hazırlık görünümü."
        actions={
          <>
            <Link href="/automations"><Button variant="secondary">Otomasyonlar</Button></Link>
            <Button disabled>Tümünü Onayla</Button>
          </>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Hazırlık Modu" tone="warning" />
          <span className="font-semibold">Gerçek otomasyon adayı oluşturulmadı.</span>
        </div>
        <p className="mt-2">Onayla/Reddet aksiyonları backend hazır olana kadar kapalıdır. Bu ekrandan SMS gönderilmez.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Bekleyen" value={0} description="Gerçek aday yok" tone="amber" />
        <StatCard title="Onaylanan" value={0} description="Backend bekleniyor" tone="emerald" />
        <StatCard title="Reddedilen" value={0} description="Backend bekleniyor" tone="rose" />
      </div>

      <Card title="Bekleyen Adaylar">
        <EmptyState
          icon={<span className="text-2xl">OK</span>}
          title="Otomasyon kuyruğu boş"
          description="Gerçek automation_candidates entegrasyonu yapılana kadar aday listesi gösterilmez."
          action={<Button variant="secondary" disabled>Onay Aksiyonları Kapalı</Button>}
        />
      </Card>

      <Card title="Gönderime Dönüşüm Notu">
        <p className="text-sm leading-6 text-gray-600">
          İlk canlı sürümde onaylanan adaylar doğrudan SMS göndermemeli; mevcut kampanya hazırlama/kuyruk akışına manuel onaylı şekilde aktarılmalıdır.
        </p>
      </Card>
    </div>
  )
}
