"use client"

import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { PLAN_LABELS } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"

type PlanId = "starter" | "professional" | "agency"

interface Plan {
  id: PlanId
  name: string
  audience: string
  description: string
  features: string[]
  highlighted: boolean
  cta: string
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Başlangıç",
    audience: "Küçük işletmeler",
    description: "Temel CRM ve manuel SMS kampanyaları için sade kullanım.",
    features: [
      "Kişi ve grup yönetimi",
      "Manuel SMS kampanyası",
      "Kara liste yönetimi",
      "Temel kampanya raporu",
      "Provider bağlantı durumu",
    ],
    highlighted: false,
    cta: "Bu Planı Değerlendir",
  },
  {
    id: "professional",
    name: "Profesyonel",
    audience: "Büyüyen ekipler",
    description: "Raporlama, izin yönetimi ve API entegrasyonu ile operasyonel kullanım.",
    features: [
      "CSV import sihirbazı",
      "İzinli iletişim takibi",
      "Gelişmiş kampanya raporu",
      "API anahtarları ve dokümantasyon",
      "Audit log görünümü",
    ],
    highlighted: true,
    cta: "Profesyonel İçin Talep Gönder",
  },
  {
    id: "agency",
    name: "Ajans / Kurumsal",
    audience: "Çoklu operasyonlar",
    description: "Birden fazla firma veya yüksek hacimli entegrasyon yönetimi için.",
    features: [
      "Çoklu firma operasyonu",
      "Gelişmiş yetki yönetimi",
      "Webhook hazırlığı",
      "Özel onboarding",
      "Öncelikli destek",
    ],
    highlighted: false,
    cta: "Kurumsal Görüşme Talep Et",
  },
]

const comparisonRows = [
  ["SMS kredisi", "Sağlayıcı hesabınızdan", "Sağlayıcı hesabınızdan", "Sağlayıcı hesabınızdan"],
  ["Onaylı başlık kontrolü", "Var", "Var", "Var"],
  ["Kara liste", "Var", "Var", "Var"],
  ["İzin yönetimi", "Temel", "Gelişmiş", "Gelişmiş"],
  ["API", "-", "Var", "Var"],
  ["Audit log", "-", "Var", "Var"],
  ["Webhook", "-", "Hazırlık", "Planlanıyor"],
]

export default function PlanPage() {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("professional")
  const [currentPlan, setCurrentPlan] = useState<PlanId>("starter")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) ?? plans[1], [selectedPlanId])

  useEffect(() => {
    const loadPlan = async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc("get_customer_plan")
      const plan = data?.[0]?.plan
      if (plan === "starter" || plan === "professional" || plan === "agency") setCurrentPlan(plan)
    }
    loadPlan()
  }, [])

  const sendRequest = async () => {
    setSending(true)
    try {
      const response = await fetch("/api/plan-upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_plan: selectedPlan.id,
          current_plan: currentPlan,
          message,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Plan talebi gönderilemedi.")
      toast.success(payload.message || "Plan talebiniz alındı.")
      setMessage("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Plan talebi gönderilemedi.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planım ve Paketler"
        description="MSGNEX yazılım kullanım paketlerini karşılaştırın. SMS kredisi paketlere dahil değildir; gönderimler firmanızın kendi sağlayıcı hesabından yapılır."
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <p className="font-semibold">MSGNEX SMS kredisi satmaz.</p>
        <p>Platform; provider bağlantısı, CRM, izin yönetimi, kampanya operasyonu, raporlama ve API katmanı sunar. Sağlayıcı bakiyesi ve başlık tanımı firmanızın kendi Netgsm hesabında yönetilir.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={plan.highlighted ? "border-blue-300 shadow-lg shadow-blue-950/10" : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-blue-700">{plan.audience}</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">{plan.name}</h2>
              </div>
              {plan.highlighted && <StatusBadge label="Önerilen" tone="info" />}
            </div>
            <p className="mt-4 min-h-12 text-sm leading-6 text-gray-600">{plan.description}</p>
            <div className="mt-5 space-y-3">
              {plan.features.map((feature) => (
                <FeatureRow key={feature} text={feature} />
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Fiyatlandırma yazılım kullanım hakkı ve operasyonel özelliklere göre belirlenir.
            </div>
            <Button
              type="button"
              variant={selectedPlanId === plan.id ? "primary" : "secondary"}
              className="mt-5 w-full"
              onClick={() => setSelectedPlanId(plan.id)}
            >
              {plan.cta}
            </Button>
          </Card>
        ))}
      </div>

      <Card title="Yükseltme Talebi">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Seçilen paket</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{selectedPlan.name}</p>
            <p className="mt-2 text-sm text-slate-600">Mevcut plan: <span className="font-semibold">{PLAN_LABELS[currentPlan]}</span></p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{selectedPlan.description}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Not</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Bu talep SMS kredisi veya sağlayıcı bakiyesi yenileme işlemi değildir. Ekibimiz yazılım paketi ve kullanım ihtiyacı için iletişime geçer.</p>
          </div>
          <div>
            <label htmlFor="plan-request-message" className="text-sm font-medium text-slate-700">İhtiyaç notu</label>
            <textarea
              id="plan-request-message"
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Örn. daha fazla kullanıcı, API entegrasyonu, ajans kullanımı veya raporlama ihtiyacınızı yazabilirsiniz."
              className="mt-2 block w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{message.length}/1000 karakter</p>
              <Button type="button" disabled={sending} onClick={sendRequest}>
                {sending ? "Gönderiliyor..." : "Talep Gönder"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Paket Karşılaştırması">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-3 pr-4 font-semibold">Özellik</th>
                <th className="py-3 pr-4 font-semibold">Başlangıç</th>
                <th className="py-3 pr-4 font-semibold">Profesyonel</th>
                <th className="py-3 pr-4 font-semibold">Ajans / Kurumsal</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row[0]} className="border-b border-gray-100 last:border-0">
                  {row.map((cell, index) => (
                    <td key={`${row[0]}-${index}`} className={index === 0 ? "py-3 pr-4 font-semibold text-gray-950" : "py-3 pr-4 text-gray-700"}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Ticari Konumlandırma">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <ValueBox title="Güven" text="Onaylı başlık, kara liste ve izin yönetimi yanlış gönderim riskini azaltır." />
          <ValueBox title="Operasyon" text="Kişiler, segmentler, kampanyalar ve raporlar tek panelde yönetilir." />
          <ValueBox title="Entegrasyon" text="API anahtarları ile dış sistemlerden güvenli SMS gönderimi yapılabilir." />
        </div>
      </Card>
    </div>
  )
}

function FeatureRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
      <span>{text}</span>
    </div>
  )
}

function ValueBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="font-semibold text-gray-950">{title}</p>
      <p className="mt-2 leading-6 text-gray-600">{text}</p>
    </div>
  )
}
