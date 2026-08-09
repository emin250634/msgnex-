"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"

interface SetupStep {
  id: string
  title: string
  description: string
  done: boolean
  href: string
  action: string
  optional?: boolean
}

interface ProviderStatus {
  connection_status: string
  sender_header: string | null
  has_provider: boolean
  last_synced_at: string | null
}

export default function SetupPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [plan, setPlan] = useState<{ company_id: string; plan: CompanyPlan; has_api_access: boolean; has_webhook: boolean } | null>(null)
  const [provider, setProvider] = useState<ProviderStatus | null>(null)
  const [counts, setCounts] = useState({
    contacts: 0,
    groups: 0,
    templates: 0,
    campaigns: 0,
    apiKeys: 0,
    webhooks: 0,
  })

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const [{ data: planRows, error: planError }, { data: providerRows, error: providerError }] = await Promise.all([
      supabase.rpc("get_customer_plan"),
      supabase.rpc("get_customer_provider_status"),
    ])

    if (planError || providerError) {
      setError(planError?.message || providerError?.message || "Kurulum verileri alınamadı")
      setLoading(false)
      return
    }

    const currentPlan = planRows?.[0] ?? null
    const companyId = currentPlan?.company_id
    setPlan(currentPlan)
    setProvider(providerRows?.[0] ?? null)

    if (!companyId) {
      setCounts({ contacts: 0, groups: 0, templates: 0, campaigns: 0, apiKeys: 0, webhooks: 0 })
      setLoading(false)
      return
    }

    const [
      { count: contacts },
      { count: groups },
      { count: templates },
      { count: campaigns },
      { data: apiKeys },
      { data: webhooks, error: webhookError },
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("groups").select("*", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("sms_templates").select("*", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("sms_campaigns").select("*", { count: "exact", head: true }).eq("company_id", companyId),
      currentPlan?.has_api_access ? supabase.rpc("list_customer_api_keys") : Promise.resolve({ data: [] }),
      currentPlan?.has_webhook ? supabase.rpc("list_company_webhooks") : Promise.resolve({ data: [] as unknown[], error: null }),
    ])

    setCounts({
      contacts: contacts ?? 0,
      groups: groups ?? 0,
      templates: templates ?? 0,
      campaigns: campaigns ?? 0,
      apiKeys: Array.isArray(apiKeys) ? apiKeys.filter((key: any) => key.is_active).length : 0,
      webhooks: webhookError ? 0 : Array.isArray(webhooks) ? webhooks.filter((webhook: any) => webhook.is_active).length : 0,
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const providerReady = Boolean(provider?.has_provider && provider.sender_header && provider.connection_status !== "disabled")
  const steps = useMemo<SetupStep[]>(() => [
    {
      id: "provider",
      title: "Provider bağlantısını hazırla",
      description: "Netgsm hesabı, API bilgileri ve bağlantı durumu tamamlanmalı.",
      done: providerReady,
      href: "/provider",
      action: "Providerı Aç",
    },
    {
      id: "sender-header",
      title: "Onaylı SMS başlığını doğrula",
      description: "Gönderimler manuel başlıkla değil, sağlayıcıdan gelen onaylı başlıkla yapılır.",
      done: Boolean(provider?.sender_header),
      href: "/provider",
      action: "Başlığı Kontrol Et",
    },
    {
      id: "contacts",
      title: "İlk kişi listesini ekle",
      description: "Pilot test için izin durumu bilinen en az bir kişi veya küçük bir test listesi ekleyin.",
      done: counts.contacts > 0,
      href: "/contacts",
      action: "Kişileri Aç",
    },
    {
      id: "groups",
      title: "Test segmenti oluştur",
      description: "İlk kampanya için küçük ve kontrollü bir grup/segment oluşturun.",
      done: counts.groups > 0,
      href: "/groups",
      action: "Grupları Aç",
    },
    {
      id: "template",
      title: "İlk mesaj şablonunu hazırla",
      description: "Tekrar kullanılacak kampanya veya bilgilendirme metnini şablon olarak kaydedin.",
      done: counts.templates > 0,
      href: "/templates",
      action: "Şablonları Aç",
      optional: true,
    },
    {
      id: "first-campaign",
      title: "İlk test kampanyasını gönder",
      description: "Provider hazır olduğunda küçük bir test alıcısına kampanya kuyruğa alın.",
      done: counts.campaigns > 0,
      href: "/sms",
      action: "SMS Gönder",
    },
    {
      id: "api",
      title: "API entegrasyonunu hazırla",
      description: "Dış sistemden gönderim yapılacaksa API anahtarı oluşturun ve rehberi paylaşın.",
      done: !plan?.has_api_access || counts.apiKeys > 0,
      href: "/api-keys",
      action: "API Anahtarları",
      optional: true,
    },
    {
      id: "webhook",
      title: "Webhook sonucunu bağla",
      description: "Ajans/Kurumsal kullanımda kampanya ve provider sonuçlarını dış sisteme aktarın.",
      done: !plan?.has_webhook || counts.webhooks > 0,
      href: "/webhooks",
      action: "Webhookları Aç",
      optional: true,
    },
  ], [counts, plan, provider, providerReady])

  const requiredSteps = steps.filter((step) => !step.optional)
  const completedRequired = requiredSteps.filter((step) => step.done).length
  const completedAll = steps.filter((step) => step.done).length
  const progress = requiredSteps.length > 0 ? Math.round((completedRequired / requiredSteps.length) * 100) : 0
  const nextStep = steps.find((step) => !step.done && !step.optional) ?? steps.find((step) => !step.done)

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kurulum" description="Pilot müşteri kullanımı için gerekli adımları tamamlayın." />
        <LoadingState variant="table" rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kurulum" description="Pilot müşteri kullanımı için gerekli adımları tamamlayın." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kurulum"
        description={`Pilot müşteri kullanımı için gerekli adımları tamamlayın. Mevcut plan: ${plan ? PLAN_LABELS[plan.plan] : "-"}`}
        actions={<Button variant="secondary" onClick={load}>Yenile</Button>}
      />

      <Card>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={progress === 100 ? "Hazır" : "Kurulum Sürüyor"} tone={progress === 100 ? "success" : "warning"} />
              <span className="text-sm text-gray-500">{completedAll} / {steps.length} toplam adım tamamlandı</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-gray-950">Pilot başlangıç ilerlemesi %{progress}</h2>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            {nextStep ? (
              <p className="mt-3 text-sm leading-6 text-gray-600">Sıradaki adım: <span className="font-semibold text-gray-950">{nextStep.title}</span></p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-emerald-700">Zorunlu pilot kurulum adımları tamamlandı.</p>
            )}
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-950">Ticari amaç</p>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              Müşteri ilk girişte ne yapacağını görür; provider, kişi listesi, test gönderimi ve entegrasyon hazırlığı tek akışta ilerler.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Provider" value={providerReady ? "Hazır" : "Eksik"} tone={providerReady ? "success" : "warning"} />
        <Metric title="Kişi" value={counts.contacts.toLocaleString("tr-TR")} tone={counts.contacts > 0 ? "success" : "warning"} />
        <Metric title="Kampanya" value={counts.campaigns.toLocaleString("tr-TR")} tone={counts.campaigns > 0 ? "success" : "info"} />
      </div>

      <Card title="Kurulum Checklist">
        <div className="space-y-3">
          {steps.map((step, index) => (
            <article key={step.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className={step.done ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700" : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700"}>
                    {step.done ? "OK" : index + 1}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-950">{step.title}</h3>
                      <StatusBadge label={step.done ? "Tamam" : "Bekliyor"} tone={step.done ? "success" : "warning"} />
                      {step.optional && <StatusBadge label="Opsiyonel" tone="neutral" />}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{step.description}</p>
                  </div>
                </div>
                <Link href={step.href} className="shrink-0">
                  <Button variant={step.done ? "secondary" : "primary"} size="sm">{step.action}</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Metric({ title, value, tone }: { title: string; value: string; tone: "success" | "warning" | "info" }) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  }

  return (
    <div className={`rounded-lg border p-4 ${classes[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}
