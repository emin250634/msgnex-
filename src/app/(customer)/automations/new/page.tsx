"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { automationTypeLabels, type AutomationType } from "@/lib/automation/mock-data"

const segmentOptions = ["Yeni Kayıtlar", "VIP Müşteriler", "Tüm Müşteriler", "60 Gün Pasif", "Segmentsiz Kişiler"]
const templateOptions = ["Esans Shop Hoş Geldin", "VIP Müşteri İndirimi", "Doğum Günü Sürprizi", "Sizi Özledik", "Haftalık Kampanya"]

export default function NewAutomationPage() {
  const [name, setName] = useState("Yeni müşteri hoş geldin")
  const [type, setType] = useState<AutomationType>("welcome")
  const [segment, setSegment] = useState(segmentOptions[0])
  const [template, setTemplate] = useState(templateOptions[0])
  const [requiresApproval, setRequiresApproval] = useState(true)
  const [active, setActive] = useState(false)
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => {
    if (type === "welcome") return "Yeni eklenen müşteriler için hoş geldin mesajı kuyruğa aday olarak düşer."
    if (type === "birthday") return "Doğum günü alanı hazır olduğunda ilgili müşteriler aday olarak listelenir."
    if (type === "inactive") return "Pasif segmentteki müşteriler için hatırlatma mesajı önerilir."
    if (type === "payment") return "Vade/ödeme hatırlatması sonraki altyapı fazı için kapalı tutulur."
    return "Seçilen segmente kampanya veya indirim duyurusu önerilir."
  }, [type])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Oluştur"
        description="Mock UI üzerinden otomasyon kuralı tasarlayın. Bu ekran henüz veritabanına kayıt yazmaz."
        actions={<Link href="/automations"><Button variant="secondary">Listeye Dön</Button></Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Kural Bilgileri">
          <div className="grid gap-5">
            <Input label="Otomasyon adı" value={name} onChange={(event) => setName(event.target.value)} placeholder="Otomasyon adı" />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tür seçimi</label>
              <select value={type} onChange={(event) => setType(event.target.value as AutomationType)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {Object.entries(automationTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Segment seçimi</label>
              <select value={segment} onChange={(event) => setSegment(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {segmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">SMS şablonu</label>
              <select value={template} onChange={(event) => setTemplate(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {templateOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                <span>
                  <span className="block text-sm font-semibold text-gray-950">Manuel onay</span>
                  <span className="mt-1 block text-xs text-gray-500">Gönderimden önce kullanıcı kontrolü</span>
                </span>
                <input type="checkbox" checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} className="h-5 w-5 rounded border-gray-300" />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                <span>
                  <span className="block text-sm font-semibold text-gray-950">Aktif</span>
                  <span className="mt-1 block text-xs text-gray-500">MVP&apos;de sadece görsel durum</span>
                </span>
                <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-5 w-5 rounded border-gray-300" />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setSaved(true)}>Mock Olarak Kaydet</Button>
              <Link href="/automation-queue"><Button variant="secondary">Kuyruğu Aç</Button></Link>
            </div>

            {saved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Mock otomasyon taslağı hazırlandı. Bu işlem veritabanına kayıt yazmadı.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Önizleme">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Otomasyon</p>
                <p className="mt-1 text-lg font-semibold text-gray-950">{name || "-"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={automationTypeLabels[type]} tone={type === "birthday" ? "purple" : "info"} />
                <StatusBadge label={active ? "Aktif" : "Pasif"} tone={active ? "success" : "neutral"} />
                <StatusBadge label={requiresApproval ? "Manuel onaylı" : "Onaysız"} tone={requiresApproval ? "warning" : "danger"} />
              </div>
              <Info label="Segment" value={segment} />
              <Info label="Şablon" value={template} />
              <p className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600">{preview}</p>
            </div>
          </Card>

          <Card title="MVP Notu">
            <p className="text-sm leading-6 text-gray-600">
              İlk sürümde otomasyon kuralı aday üretmeli, gerçek SMS gönderimi otomasyon kuyruğunda manuel onaydan sonra başlatılmalıdır.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-950">{value}</p>
    </div>
  )
}
