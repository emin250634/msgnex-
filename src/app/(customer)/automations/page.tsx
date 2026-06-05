"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyonlar"
        description="Hoş geldin, kampanya ve müşteri hatırlatma akışları için hazırlık alanı."
        actions={
          <>
            <Link href="/automation-queue"><Button variant="secondary">Kuyruğu Gör</Button></Link>
            <Link href="/automations/new"><Button variant="secondary">Otomasyon Oluştur</Button></Link>
          </>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Hazırlık Modu" tone="warning" />
          <span className="font-semibold">Otomasyon modülü henüz gerçek backend’e bağlı değildir.</span>
        </div>
        <p className="mt-2">Gerçek otomasyon kuralı, aday üretimi veya SMS gönderimi yapılmaz.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Toplam Otomasyon" value={0} description="Gerçek kayıt yok" tone="slate" />
        <StatCard title="Aktif" value={0} description="Backend bekleniyor" tone="amber" />
        <StatCard title="Manuel Onaylı" value={0} description="Kural tablosu bekleniyor" tone="amber" />
        <StatCard title="Aday Sayısı" value={0} description="Gerçek aday yok" tone="slate" />
      </div>

      <Card title="Otomasyon Listesi">
        <EmptyState
          icon={<span className="text-2xl">OT</span>}
          title="Gerçek otomasyon kaydı yok"
          description="Automation backend/RPC hazır olduğunda kurallar burada listelenecek. Şu an SMS gönderimi yapılmaz."
          action={<Button variant="secondary" disabled>Backend Bekleniyor</Button>}
        />
      </Card>

      <Card title="Canlıya Hazırlık">
        <div className="grid gap-4 text-sm text-gray-600 md:grid-cols-3">
          <InfoBox title="Kural kaydı" text="automation_rules tablosu veya RPC hazır olduğunda aktif edilecek." />
          <InfoBox title="Aday üretimi" text="automation_candidates gerçek segment ve şablon verisinden üretilecek." />
          <InfoBox title="Güvenli gönderim" text="İlk sürümde adaylar SMS göndermeden önce manuel onay bekleyecek." />
        </div>
      </Card>
    </div>
  )
}

function InfoBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="font-semibold text-gray-950">{title}</p>
      <p className="mt-1">{text}</p>
    </div>
  )
}
