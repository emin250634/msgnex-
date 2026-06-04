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
    if (type === "welcome") return "Yeni eklenen kişiler için hoş geldin mesajı kuyruğa aday olarak düşer."
    if (type === "birthday") return "Doğum günü alanı hazır olduğunda ilgili kişiler aday olarak listelenir."
    if (type === "inactive") return "Pasif segmentteki kişiler için hatırlatma mesajı önerilir."
    if (type === "payment") return "Vade ve ödeme hatırlatması sonraki altyapı fazı için kapalı tutulur."
    return "Seçilen segmente kampanya veya indirim duyurusu önerilir."
  }, [type])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Oluştur"
        description="Otomasyon kuralını tasarlayın. Bu MVP ekranı henüz veritabanına kayıt yazmaz."
        actions={<Link href="/automations"><Button variant="secondary">Listeye Dön</Button></Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Kural Bilgileri">
          <div className="grid gap-5">
            <Input label="Otomasyon adı" value={name} onChange={(event) => setName(event.target.value)} placeholder="Otomasyon adı" />

            <Field label="Tür seçimi">
              <select value={type} onChange={(event) => setType(event.target.value as AutomationType)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {Object.entries(automationTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>

            <Field label="Segment seçimi">
              <select value={segment} onChange={(event) => setSegment(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {segmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>

            <Field label="SMS şablonu">
              <select value={template} onChange={(event) => setTemplate(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {templateOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleCard title="Manuel onay" description="Gönderimden önce kullanıcı kontrolü" checked={requiresApproval} onChange={setRequiresApproval} />
              <ToggleCard title="Aktif" description="MVP sürümünde sadece görsel durum" checked={active} onChange={setActive} />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setSaved(true)}>Taslağı Hazırla</Button>
              <Link href="/automation-queue"><Button variant="secondary">Kuyruğu Aç</Button></Link>
            </div>

            {saved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Otomasyon taslağı hazırlandı. Bu işlem veritabanına kayıt yazmadı.
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function ToggleCard({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
      <span>
        <span className="block text-sm font-semibold text-gray-950">{title}</span>
        <span className="mt-1 block text-xs text-gray-500">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 rounded border-gray-300" />
    </label>
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
