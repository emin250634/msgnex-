"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"

export default function NewAutomationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Oluştur"
        description="Otomasyon kuralı oluşturma ekranı hazırlık modunda."
        actions={<Link href="/automations"><Button variant="secondary">Listeye Dön</Button></Link>}
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Hazırlık Modu" tone="warning" />
          <span className="font-semibold">Bu ekran henüz veritabanına otomasyon kaydı yazmaz.</span>
        </div>
        <p className="mt-2">Kaydetme, aday üretme ve SMS akışına bağlama işlemleri backend entegrasyonu sonrası aktif edilecek.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Kural Bilgileri">
          <div className="grid gap-5">
            <Input label="Otomasyon adı" placeholder="Backend hazır olduğunda girilecek" disabled />

            <Field label="Tür seçimi">
              <select disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <option>Henüz yapılandırılmadı</option>
              </select>
            </Field>

            <Field label="Segment seçimi">
              <select disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <option>Gerçek segment bağlantısı bekleniyor</option>
              </select>
            </Field>

            <Field label="SMS şablonu">
              <select disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <option>Gerçek şablon bağlantısı bekleniyor</option>
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <TogglePreview title="Manuel onay" description="İlk canlı sürümde zorunlu olacak" />
              <TogglePreview title="Aktif" description="Backend hazır olana kadar kapalı" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled>Kaydet</Button>
              <Link href="/automation-queue"><Button variant="secondary">Kuyruğu Aç</Button></Link>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Önizleme">
            <div className="space-y-4">
              <StatusBadge label="SMS gönderilmez" tone="warning" />
              <p className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                Gerçek otomasyon backend’i bağlanana kadar kural oluşturulmaz, aday üretilmez ve kampanya akışına kayıt yazılmaz.
              </p>
            </div>
          </Card>

          <Card title="Gerekli Backend">
            <ul className="space-y-2 text-sm text-gray-600">
              <li>automation_rules kayıt modeli</li>
              <li>automation_candidates aday modeli</li>
              <li>SMS kampanya akışına manuel onaylı aktarım RPC’si</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function TogglePreview({ title, description }: { title: string; description: string }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <span>
        <span className="block text-sm font-semibold text-gray-950">{title}</span>
        <span className="mt-1 block text-xs text-gray-500">{description}</span>
      </span>
      <input type="checkbox" disabled className="h-5 w-5 rounded border-gray-300" />
    </label>
  )
}
