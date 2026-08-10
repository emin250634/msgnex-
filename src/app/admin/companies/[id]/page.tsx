"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { PLAN_LABELS, PLAN_LIMITS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import type { Company } from "@/types"

interface ProviderSettingsResponse {
  provider_settings: {
    provider_name: string
    usercode: string | null
    sender_header: string | null
    sender_header_status: string
    connection_status: string
    is_active: boolean
    timeout_ms: number | null
    encoding: string | null
    is_test_mode: boolean
    has_secret: boolean
    secret_last_changed_at: string | null
    created_at: string | null
    updated_at: string | null
  }
  wallet: {
    balance: number
    balance_unit: string | null
    currency: string | null
    last_synced_at: string | null
    sync_status: string
    last_sync_error: string | null
  } | null
  sender_headers: Array<{
    header: string
    status: string
    last_synced_at: string | null
  }>
}

interface ProviderFormState {
  usercode: string
  secret: string
  senderHeader: string
  timeoutMs: string
  encoding: string
  isActive: boolean
  isTestMode: boolean
}

interface SalesPilotFormState {
  salesStatus: "new" | "contacted" | "pilot" | "won" | "lost"
  pilotStartedAt: string
  expectedMonthlySmsVolume: string
  salesNote: string
}

interface CompanyUserRow {
  id: string
  user_id: string
  full_name: string
  email: string
  role: "company_owner" | "company_admin" | "company_user"
  is_active: boolean
  invited_at: string | null
  accepted_at: string | null
  invitation_status: string
  last_sign_in_at: string | null
}

interface CompanyWebhookRow {
  id: string
  endpoint_url: string
  events: string[]
  is_active: boolean
  last_delivery_status: string | null
  created_at: string
}

interface CompanyWebhookDeliveryRow {
  id: string
  event_type: string
  status: string
  attempts: number
  response_status: number | null
  error: string | null
  created_at: string
}

interface CompanyOnboardingSummary {
  company_id: string
  provider_ready: boolean
  sender_header_ready: boolean
  contact_count: number
  group_count: number
  template_count: number
  campaign_count: number
  active_api_key_count: number
  active_webhook_count: number
  completed_required_steps: number
  total_required_steps: number
  progress: number
  status: "pilot_ready" | "provider_blocked" | "data_needed" | "test_campaign_needed" | "in_progress"
  next_step: string
}

function formatDate(value?: string | null) {
  if (!value) return "Yok"
  return new Date(value).toLocaleString("tr-TR")
}

function connectionLabel(status?: string | null) {
  const labels: Record<string, string> = {
    not_configured: "Yapılandırılmadı",
    connected: "Bağlı",
    error: "Hatalı",
    disabled: "Pasif",
  }
  return labels[status || "not_configured"] || status || "Yapılandırılmadı"
}

function headerStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    unknown: "Bilinmiyor",
    pending: "Bekliyor",
    approved: "Onaylı",
    rejected: "Reddedildi",
    error: "Hatalı",
  }
  return labels[status || "unknown"] || status || "Bilinmiyor"
}

function syncStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    unknown: "Bilinmiyor",
    synced: "Senkronize",
    error: "Hatalı",
    stale: "Eski veri",
  }
  return labels[status || "unknown"] || status || "Bilinmiyor"
}

function salesStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    new: "Yeni",
    contacted: "Görüşüldü",
    pilot: "Pilot",
    won: "Kazanıldı",
    lost: "Kaybedildi",
  }
  return labels[status || "new"] || status || "Yeni"
}

function salesStatusTone(status?: string | null) {
  if (status === "won") return "success" as const
  if (status === "lost") return "danger" as const
  if (status === "pilot") return "info" as const
  if (status === "contacted") return "warning" as const
  return "neutral" as const
}

function parseSalesNoteSummary(note: string) {
  return note
    .split("\n")
    .map((line) => {
      const [label, ...rest] = line.split(":")
      return { label: label.trim(), value: rest.join(":").trim() }
    })
    .filter((item) => item.label && item.value)
}

function statusTone(status?: string | null) {
  if (status === "connected" || status === "approved" || status === "synced") return "success" as const
  if (status === "error" || status === "rejected") return "danger" as const
  if (status === "disabled") return "neutral" as const
  return "warning" as const
}

function onboardingLabel(status: CompanyOnboardingSummary["status"]) {
  const labels = {
    pilot_ready: "Pilot Hazır",
    provider_blocked: "Provider Eksik",
    data_needed: "Veri Bekliyor",
    test_campaign_needed: "Test Bekliyor",
    in_progress: "Kurulum Sürüyor",
  }
  return labels[status] || status
}

function onboardingTone(status: CompanyOnboardingSummary["status"]) {
  if (status === "pilot_ready") return "success" as const
  if (status === "provider_blocked") return "danger" as const
  if (status === "data_needed" || status === "test_campaign_needed") return "warning" as const
  return "info" as const
}

function formFromSettings(data: ProviderSettingsResponse): ProviderFormState {
  const settings = data.provider_settings
  return {
    usercode: settings.usercode || "",
    secret: "",
    senderHeader: settings.sender_header || "",
    timeoutMs: String(settings.timeout_ms || 15000),
    encoding: settings.is_test_mode ? "TEST" : settings.encoding || "TR",
    isActive: settings.is_active,
    isTestMode: Boolean(settings.is_test_mode),
  }
}

export default function AdminCompanyDetailPage() {
  const params = useParams<{ id: string }>()
  const [company, setCompany] = useState<Company | null>(null)
  const [providerData, setProviderData] = useState<ProviderSettingsResponse | null>(null)
  const [companyUsers, setCompanyUsers] = useState<CompanyUserRow[]>([])
  const [companyWebhooks, setCompanyWebhooks] = useState<CompanyWebhookRow[]>([])
  const [webhookDeliveries, setWebhookDeliveries] = useState<CompanyWebhookDeliveryRow[]>([])
  const [onboardingSummary, setOnboardingSummary] = useState<CompanyOnboardingSummary | null>(null)
  const [form, setForm] = useState<ProviderFormState>({
    usercode: "",
    secret: "",
    senderHeader: "",
    timeoutMs: "15000",
    encoding: "TR",
    isActive: false,
    isTestMode: false,
  })
  const [salesForm, setSalesForm] = useState<SalesPilotFormState>({
    salesStatus: "new",
    pilotStartedAt: "",
    expectedMonthlySmsVolume: "",
    salesNote: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingSales, setSavingSales] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [providerAction, setProviderAction] = useState<"test_connection" | "query_headers" | "query_credit" | null>(null)
  const [error, setError] = useState("")
  const [inviteForm, setInviteForm] = useState({
    fullName: "",
    email: "",
    role: "company_user",
  })

  const load = async () => {
    setLoading(true)
    setError("")

    const supabase = createClient()
    const [{ data: companyData }, providerResponse, usersResponse, { data: webhookRows }, { data: deliveryRows }, { data: onboardingRows }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", params.id).maybeSingle(),
      fetch(`/api/admin/companies/${params.id}/provider-settings`),
      fetch(`/api/admin/companies/${params.id}/users`),
      supabase
        .from("company_webhooks")
        .select("id, endpoint_url, events, is_active, last_delivery_status, created_at")
        .eq("company_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("webhook_deliveries")
        .select("id, event_type, status, attempts, response_status, error, created_at")
        .eq("company_id", params.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.rpc("list_admin_company_onboarding", { p_company_id: params.id }),
    ])

    if (!companyData) {
      setCompany(null)
      setLoading(false)
      return
    }
    setCompany(companyData)
    setSalesForm({
      salesStatus: companyData.sales_status || "new",
      pilotStartedAt: companyData.pilot_started_at || "",
      expectedMonthlySmsVolume: companyData.expected_monthly_sms_volume || "",
      salesNote: companyData.sales_note || "",
    })

    if (!providerResponse.ok) {
      const payload = await providerResponse.json().catch(() => ({ error: "Provider ayarları yüklenemedi" }))
      setError(payload.error || "Provider ayarları yüklenemedi")
      setLoading(false)
      return
    }

    const payload = await providerResponse.json() as ProviderSettingsResponse
    setProviderData(payload)
    setForm(formFromSettings(payload))
    if (usersResponse.ok) {
      const usersPayload = await usersResponse.json() as { users: CompanyUserRow[] }
      setCompanyUsers(usersPayload.users)
    }
    setCompanyWebhooks((webhookRows ?? []) as CompanyWebhookRow[])
    setWebhookDeliveries((deliveryRows ?? []) as CompanyWebhookDeliveryRow[])
    setOnboardingSummary(((onboardingRows ?? []) as CompanyOnboardingSummary[])[0] ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const settings = providerData?.provider_settings
  const wallet = providerData?.wallet
  const senderHeaders = providerData?.sender_headers ?? []
  const hasProviderRecord = Boolean(settings?.created_at)
  const companyPlan = company?.plan || "starter"
  const planLimits = PLAN_LIMITS[companyPlan]
  const activeUserCount = companyUsers.filter((user) => user.is_active).length
  const userLimitReached = activeUserCount >= planLimits.users
  const salesNoteSummary = useMemo(() => parseSalesNoteSummary(salesForm.salesNote), [salesForm.salesNote])

  const providerHealth = useMemo(() => {
    if (!settings?.is_active) return { label: "Hazır değil", tone: "warning" as const }
    if (settings.encoding === "TEST") {
      return { label: "Test Modu Hazır", tone: "success" as const }
    }
    if (settings.connection_status === "connected" && settings.sender_header_status === "approved") {
      return { label: "Gönderime Hazır", tone: "success" as const }
    }
    return { label: "Yapılandırma bekliyor", tone: "warning" as const }
  }, [settings])

  const providerChecklist = useMemo(() => [
    { label: "Provider kaydı", done: hasProviderRecord },
    { label: settings?.encoding === "TEST" ? "Test provider seçili" : "Netgsm usercode kaydı", done: Boolean(settings?.usercode) },
    { label: settings?.encoding === "TEST" ? "Test secret kaydı" : "Encrypted secret kaydı", done: Boolean(settings?.has_secret) },
    { label: "Başlık bilgisi", done: Boolean(settings?.sender_header) },
    { label: "Sağlayıcı kredi sorgusu", done: Boolean(wallet?.last_synced_at) },
  ], [hasProviderRecord, settings?.encoding, settings?.has_secret, settings?.sender_header, settings?.usercode, wallet?.last_synced_at])

  const handleSave = async () => {
    setSaving(true)
    const response = await fetch(`/api/admin/companies/${params.id}/provider-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usercode: form.usercode,
        secret: form.secret,
        sender_header: form.senderHeader,
        timeout_ms: Number(form.timeoutMs),
        encoding: form.encoding,
        is_active: form.isActive,
        is_test_mode: form.isTestMode,
      }),
    })

    const payload = await response.json().catch(() => ({ error: "Provider ayarları kaydedilemedi" }))
    setSaving(false)

    if (!response.ok) {
      toast.error(payload.error || "Provider ayarları kaydedilemedi")
      return
    }

    const nextData = payload as ProviderSettingsResponse
    setProviderData(nextData)
    setForm(formFromSettings(nextData))
    toast.success("Provider ayarları kaydedildi")
  }

  const handlePlanSave = async (plan: CompanyPlan) => {
    if (!company || company.plan === plan) return
    setSavingPlan(true)
    const response = await fetch(`/api/admin/companies/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    })
    const payload = await response.json().catch(() => ({ error: "Firma planı güncellenemedi" }))
    setSavingPlan(false)

    if (!response.ok) {
      toast.error(payload.error || "Firma planı güncellenemedi")
      return
    }

    setCompany(payload.company)
    toast.success(payload.message || "Firma planı güncellendi")
  }

  const handleSalesSave = async () => {
    setSavingSales(true)
    const response = await fetch(`/api/admin/companies/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sales_status: salesForm.salesStatus,
        pilot_started_at: salesForm.pilotStartedAt || null,
        expected_monthly_sms_volume: salesForm.expectedMonthlySmsVolume || null,
        sales_note: salesForm.salesNote || null,
      }),
    })
    const payload = await response.json().catch(() => ({ error: "Satış bilgileri güncellenemedi" }))
    setSavingSales(false)

    if (!response.ok) {
      toast.error(payload.error || "Satış bilgileri güncellenemedi")
      return
    }

    setCompany(payload.company)
    toast.success(payload.message || "Satış bilgileri güncellendi")
  }

  const runProviderAction = async (action: "test_connection" | "query_headers" | "query_credit") => {
    setProviderAction(action)
    const response = await fetch(`/api/admin/companies/${params.id}/provider-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    const payload = await response.json().catch(() => ({ error: "Provider aksiyonu tamamlanamadı" }))
    setProviderAction(null)

    if (!response.ok) {
      toast.error(payload.error || "Provider aksiyonu tamamlanamadı")
      return
    }

    const nextData = payload as ProviderSettingsResponse & { result?: { ok?: boolean; message?: string } }
    setProviderData(nextData)
    setForm(formFromSettings(nextData))

    if (nextData.result?.ok === false) {
      toast.error(nextData.result.message || "Provider sorgusu hata verdi")
      return
    }

    toast.success(nextData.result?.message || "Provider bilgisi güncellendi")
  }

  const handleInvite = async () => {
    if (!inviteForm.fullName.trim() || !inviteForm.email.trim()) {
      toast.error("Ad soyad ve e-posta zorunludur")
      return
    }

    setInviting(true)
    const response = await fetch(`/api/admin/companies/${params.id}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: inviteForm.fullName,
        email: inviteForm.email,
        role: inviteForm.role,
      }),
    })
    const payload = await response.json().catch(() => ({ error: "Davet gönderilemedi" }))
    setInviting(false)

    if (!response.ok) {
      toast.error(payload.error || "Davet gönderilemedi")
      return
    }

    setInviteForm({ fullName: "", email: "", role: "company_user" })
    toast.success("Davet gönderildi")
    load()
  }

  const updateCompanyUser = async (membershipId: string, updates: { role?: string; is_active?: boolean }) => {
    const response = await fetch(`/api/admin/companies/${params.id}/users/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    const payload = await response.json().catch(() => ({ error: "Kullanıcı güncellenemedi" }))

    if (!response.ok) {
      toast.error(payload.error || "Kullanıcı güncellenemedi")
      return
    }

    toast.success("Kullanıcı güncellendi")
    load()
  }

  const deleteCompanyUser = async (user: CompanyUserRow) => {
    const confirmed = window.confirm(`${user.full_name || user.email} kullanicisini kalici olarak silmek istiyor musunuz?`)
    if (!confirmed) return

    setDeletingUserId(user.id)
    const response = await fetch(`/api/admin/companies/${params.id}/users/${user.id}`, {
      method: "DELETE",
    })
    const payload = await response.json().catch(() => ({ error: "Kullanici silinemedi" }))
    setDeletingUserId(null)

    if (!response.ok) {
      toast.error(payload.error || "Kullanici silinemedi")
      return
    }

    toast.success("Kullanici kalici olarak silindi")
    load()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Firma Detayı" description="Provider ayarları yükleniyor." />
        <LoadingState variant="cards" rows={4} />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Firma bulunamadı" description="Seçilen firma kaydı bulunamadı veya erişim izni yok." />
        <Link href="/admin/companies"><Button variant="secondary">Firmalara Dön</Button></Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={company.name} description="Provider ayarları yüklenemedi." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title={company.name}
        description="Firma profili, sender başlığı ve firma bazlı Netgsm provider ayarları."
        actions={<Link href="/admin/companies"><Button variant="secondary">Firmalara Dön</Button></Link>}
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <p className="font-semibold">Bu fazda yalnızca güvenli okuma/kayıt/güncelleme aktiftir.</p>
        <p>Gerçek Netgsm hesabı olmadan uçtan uca deneme için test modu kullanılabilir. Test modu gerçek SMS göndermez.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Plan" value={PLAN_LABELS[company.plan || "starter"]} description="Yazılım paketi" tone="blue" icon={<span className="font-semibold">PL</span>} />
        <StatCard title="Sağlayıcı" value={settings?.encoding === "TEST" ? "Test Provider" : hasProviderRecord ? "Netgsm" : "Henüz bağlanmadı"} description="Firma bazlı provider" tone="slate" icon={<span className="font-semibold">NG</span>} />
        <StatCard title="Bağlantı" value={connectionLabel(settings?.connection_status)} description="Test bağlantısı bu fazda yok" tone={settings?.connection_status === "connected" ? "emerald" : "amber"} icon={<span className="font-semibold">API</span>} />
        <StatCard title="Netgsm Kredi Durumu" value={wallet ? wallet.balance.toLocaleString("tr-TR") : "-"} description={wallet ? `${wallet.balance_unit || "sms"} / ${wallet.currency || "TRY"}` : "Henüz sorgulanmadı"} tone="slate" icon={<span className="font-semibold">₺</span>} />
      </div>

      {onboardingSummary && (
        <Card title="Pilot Onboarding Durumu">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={onboardingLabel(onboardingSummary.status)} tone={onboardingTone(onboardingSummary.status)} />
                <span className="text-sm text-gray-500">
                  {onboardingSummary.completed_required_steps} / {onboardingSummary.total_required_steps} zorunlu adım
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">%{onboardingSummary.progress} tamamlandı</p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${onboardingSummary.progress}%` }} />
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Sıradaki aksiyon: <span className="font-semibold text-gray-950">{onboardingSummary.next_step}</span>
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-950">Pilot takip özeti</p>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <InfoRow label="Kişi" value={onboardingSummary.contact_count.toLocaleString("tr-TR")} />
                <InfoRow label="Segment" value={onboardingSummary.group_count.toLocaleString("tr-TR")} />
                <InfoRow label="Kampanya" value={onboardingSummary.campaign_count.toLocaleString("tr-TR")} />
                <InfoRow label="API Key" value={onboardingSummary.active_api_key_count.toLocaleString("tr-TR")} />
                <InfoRow label="Webhook" value={onboardingSummary.active_webhook_count.toLocaleString("tr-TR")} />
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <OnboardingCheck label="Provider" done={onboardingSummary.provider_ready} />
            <OnboardingCheck label="Başlık" done={onboardingSummary.sender_header_ready} />
            <OnboardingCheck label="Kişi" done={onboardingSummary.contact_count > 0} />
            <OnboardingCheck label="Segment" done={onboardingSummary.group_count > 0} />
            <OnboardingCheck label="Test Kampanya" done={onboardingSummary.campaign_count > 0} />
          </div>
        </Card>
      )}

      <Card title="Satış & Pilot Notları">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4 md:grid-cols-3">
            {salesNoteSummary.length > 0 && (
              <div className="md:col-span-3">
                <p className="mb-2 text-sm font-semibold text-gray-950">Demo satış bağlamı</p>
                <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-2">
                  {salesNoteSummary.map((item) => (
                    <div key={`${item.label}-${item.value}`} className="rounded-lg bg-white p-3 text-sm shadow-sm">
                      <p className="text-xs font-semibold uppercase text-blue-700">{item.label}</p>
                      <p className="mt-1 leading-6 text-gray-700">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Satış durumu</label>
              <select
                value={salesForm.salesStatus}
                onChange={(event) => setSalesForm((state) => ({ ...state, salesStatus: event.target.value as SalesPilotFormState["salesStatus"] }))}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="new">Yeni</option>
                <option value="contacted">Görüşüldü</option>
                <option value="pilot">Pilot</option>
                <option value="won">Kazanıldı</option>
                <option value="lost">Kaybedildi</option>
              </select>
            </div>
            <Input
              label="Pilot başlangıç tarihi"
              type="date"
              value={salesForm.pilotStartedAt}
              onChange={(event) => setSalesForm((state) => ({ ...state, pilotStartedAt: event.target.value }))}
            />
            <Input
              label="Beklenen aylık SMS hacmi"
              placeholder="Örn: 5.000 - 10.000"
              value={salesForm.expectedMonthlySmsVolume}
              onChange={(event) => setSalesForm((state) => ({ ...state, expectedMonthlySmsVolume: event.target.value }))}
            />
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Admin satış/pilot notu</label>
              <textarea
                rows={5}
                maxLength={2000}
                value={salesForm.salesNote}
                onChange={(event) => setSalesForm((state) => ({ ...state, salesNote: event.target.value }))}
                placeholder="Görüşme notu, karar verici, pilot hedefi, takip tarihi veya fiyat beklentisi"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">{salesForm.salesNote.length}/2000 karakter</p>
            </div>
          </div>
          <aside className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-950">Satış Özeti</p>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Durum</span>
                <StatusBadge label={salesStatusLabel(salesForm.salesStatus)} tone={salesStatusTone(salesForm.salesStatus)} />
              </div>
              <InfoRow label="Pilot başlangıcı" value={salesForm.pilotStartedAt || "-"} />
              <InfoRow label="Aylık hacim" value={salesForm.expectedMonthlySmsVolume || "-"} />
            </div>
            <Button className="mt-5 w-full" onClick={handleSalesSave} disabled={savingSales}>
              {savingSales ? "Kaydediliyor..." : "Satış Bilgilerini Kaydet"}
            </Button>
          </aside>
        </div>
      </Card>

      <Card title="Firma Planı">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Atanan plan</label>
            <select
              value={company.plan || "starter"}
              disabled={savingPlan}
              onChange={(event) => handlePlanSave(event.target.value as CompanyPlan)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {Object.entries(PLAN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              Plan değişikliği SMS kredisi oluşturmaz. Sadece MSGNEX yazılım özelliklerini açar veya sınırlar.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <PlanFeatureBox title="API" enabled={company.plan === "professional" || company.plan === "agency"} />
            <PlanFeatureBox title="Audit Log" enabled={company.plan === "professional" || company.plan === "agency"} />
            <PlanFeatureBox title="Webhook" enabled={company.plan === "agency"} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <LimitBox title="Kullanıcı" value={`${activeUserCount} / ${planLimits.users}`} />
          <LimitBox title="Kişi" value={planLimits.contacts.toLocaleString("tr-TR")} />
          <LimitBox title="Kampanya Alıcısı" value={`Tek seferde ${planLimits.campaignRecipients.toLocaleString("tr-TR")}`} />
        </div>
      </Card>

      <Card title="Webhook Durumu">
        {companyWebhooks.length > 0 ? (
          <div className="space-y-3">
            {companyWebhooks.map((webhook) => (
              <div key={webhook.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-semibold text-gray-950">{webhook.endpoint_url}</p>
                  <p className="mt-1 text-xs text-gray-500">{webhook.events.join(", ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={webhook.is_active ? "Aktif" : "Pasif"} tone={webhook.is_active ? "success" : "neutral"} />
                  <StatusBadge label={webhook.last_delivery_status || "Henüz delivery yok"} tone={webhook.last_delivery_status === "success" ? "success" : webhook.last_delivery_status === "failed" ? "danger" : "warning"} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Bu firmada tanımlı webhook yok.
          </div>
        )}
        {webhookDeliveries.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-5">
            <p className="mb-3 text-sm font-semibold text-gray-950">Son Delivery Denemeleri</p>
            <div className="space-y-2">
              {webhookDeliveries.map((delivery) => (
                <div key={delivery.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={delivery.status} tone={delivery.status === "success" ? "success" : delivery.status === "failed" ? "danger" : "warning"} />
                    <span className="font-mono text-xs text-gray-600">{delivery.event_type}</span>
                    {delivery.response_status && <span className="text-xs text-gray-500">HTTP {delivery.response_status}</span>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {delivery.attempts} deneme · {new Date(delivery.created_at).toLocaleString("tr-TR")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">Provider Ayarları</span>
              <StatusBadge label={providerHealth.label} tone={providerHealth.tone} />
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Secret değeri frontend’e dönmez. Boş bırakılırsa mevcut secret korunur.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={Boolean(providerAction) || !settings?.has_secret}
              onClick={() => runProviderAction("test_connection")}
            >
              {providerAction === "test_connection" ? "Test ediliyor..." : "Test Bağlantısı"}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(providerAction) || !settings?.has_secret}
              onClick={() => runProviderAction("query_headers")}
            >
              {providerAction === "query_headers" ? "Sorgulanıyor..." : "Başlıkları Sorgula"}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(providerAction) || !settings?.has_secret}
              onClick={() => runProviderAction("query_credit")}
            >
              {providerAction === "query_credit" ? "Sorgulanıyor..." : "Sağlayıcıdan Kredi Sorgula"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 pt-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sağlayıcı" value={form.isTestMode ? "Test Provider" : hasProviderRecord ? "Netgsm" : "Henüz bağlanmadı"} />
            <Field label="Durum" badge={<StatusBadge label={settings?.is_active ? "Aktif" : "Pasif"} tone={settings?.is_active ? "success" : "neutral"} />} />
            <EditableField
              label="Usercode"
              value={form.usercode}
              placeholder={form.isTestMode ? "Test modunda otomatik" : "Henüz girilmedi"}
              disabled={form.isTestMode}
              onChange={(value) => setForm((state) => ({ ...state, usercode: value }))}
            />
            <SecretField
              hasSecret={Boolean(settings?.has_secret)}
              changedAt={settings?.secret_last_changed_at}
              value={form.secret}
              onChange={(value) => setForm((state) => ({ ...state, secret: value }))}
            />
            <SenderHeaderSelect
              value={form.senderHeader}
              headers={senderHeaders}
              isTestMode={form.isTestMode}
              onChange={(value) => setForm((state) => ({ ...state, senderHeader: value }))}
            />
            <Field label="Başlık Durumu" badge={<StatusBadge label={headerStatusLabel(settings?.sender_header_status)} tone={statusTone(settings?.sender_header_status)} />} />
            <Field label="Son Bağlantı Testi" value="Yok" />
            <Field label="Son Sağlayıcı Sorgusu" value={formatDate(wallet?.last_synced_at)} />
            <Field label="Sağlayıcıdaki Kredi" value={wallet ? `${wallet.balance.toLocaleString("tr-TR")} ${wallet.balance_unit || "sms"} ${wallet.currency || ""}` : "-"} />
            <Field label="Son Hata" value={settings?.connection_status === "error" ? "Provider bağlantısı hatalı" : "Yok"} muted={settings?.connection_status !== "error"} />
            <EditableField
              label="Encoding"
              value={form.encoding}
              placeholder="TR"
              disabled={form.isTestMode}
              onChange={(value) => setForm((state) => ({ ...state, encoding: value }))}
            />
            <EditableField
              label="Timeout"
              value={form.timeoutMs}
              placeholder="15000"
              type="number"
              onChange={(value) => setForm((state) => ({ ...state, timeoutMs: value }))}
            />
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <p className="text-sm font-semibold text-gray-950">Canlıya Hazırlık Kontrolü</p>
              <div className="mt-5 space-y-4">
                {providerChecklist.map((item) => (
                  <ChecklistItem key={item.label} label={item.label} done={item.done} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <p className="text-sm font-semibold text-gray-950">Aktiflik</p>
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <input
                  type="checkbox"
                  checked={form.isTestMode}
                  onChange={(event) => {
                    const enabled = event.target.checked
                    setForm((state) => ({
                      ...state,
                      isTestMode: enabled,
                      isActive: enabled ? true : state.isActive,
                      usercode: enabled ? "MSGNEX_TEST" : state.usercode === "MSGNEX_TEST" ? "" : state.usercode,
                      senderHeader: enabled ? state.senderHeader || "MSGNEX" : state.senderHeader === "MSGNEX" ? "" : state.senderHeader,
                      encoding: enabled ? "TEST" : "TR",
                    }))
                  }}
                  className="mt-1 h-4 w-4 rounded border-amber-300"
                />
                <span>
                  <span className="block text-sm font-semibold text-amber-950">Test modu</span>
                  <span className="mt-1 block text-xs leading-5 text-amber-800">
                    Worker gerçek Netgsm yerine fake provider kullanır. Gerçek SMS gitmez.
                  </span>
                </span>
              </label>
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((state) => ({ ...state, isActive: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-950">Provider aktif olsun</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500">
                    Test modunda kayıt otomatik hazır sayılır. Gerçek Netgsm modunda bağlantı testi ayrıca yapılmalıdır.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <p className="text-sm font-semibold text-gray-950">Sağlayıcı Kredi Durumu</p>
              <div className="mt-4 space-y-3 text-sm">
                <InfoRow label="Sağlayıcıdaki Kredi" value={wallet ? `${wallet.balance.toLocaleString("tr-TR")} ${wallet.balance_unit || "sms"}` : "-"} />
                <InfoRow label="Para Birimi" value={wallet?.currency || "-"} />
                <InfoRow label="Sorgu Durumu" value={syncStatusLabel(wallet?.sync_status)} />
                <InfoRow label="Son Sorgu" value={formatDate(wallet?.last_synced_at)} />
                <InfoRow label="Sorgu Hatası" value={wallet?.last_sync_error || "Yok"} />
              </div>
            </div>
          </aside>
        </div>
      </Card>

      <Card title="Kullanıcılar">
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Firma kullanıcıları Supabase davet akışıyla şifrelerini kendileri belirler. Admin kullanıcı şifresini göremez.
        </div>
        {userLimitReached && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Bu firma {PLAN_LABELS[companyPlan]} planındaki aktif kullanıcı limitine ulaştı. Yeni kullanıcı eklemek için planı yükseltin.
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto]">
          <Input
            label="Ad Soyad"
            placeholder="Kullanıcı adı"
            value={inviteForm.fullName}
            onChange={(event) => setInviteForm({ ...inviteForm, fullName: event.target.value })}
          />
          <Input
            label="E-posta"
            type="email"
            placeholder="kullanici@firma.com"
            value={inviteForm.email}
            onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rol</label>
            <select
              value={inviteForm.role}
              onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="company_owner">Owner</option>
              <option value="company_admin">Firma Admin</option>
              <option value="company_user">Kullanıcı</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleInvite} disabled={inviting || userLimitReached}>
              {inviting ? "Gönderiliyor..." : "Davet Et"}
            </Button>
          </div>
        </div>

        {companyUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="pb-3">Ad Soyad</th>
                  <th className="pb-3">E-posta</th>
                  <th className="pb-3">Rol</th>
                  <th className="pb-3">Durum</th>
                  <th className="pb-3">Davet</th>
                  <th className="pb-3">Son Giriş</th>
                  <th className="pb-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companyUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="py-3 font-semibold text-gray-950">{user.full_name}</td>
                    <td className="py-3 text-gray-600">{user.email}</td>
                    <td className="py-3">
                      <select
                        value={user.role}
                        onChange={(event) => updateCompanyUser(user.id, { role: event.target.value })}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
                      >
                        <option value="company_owner">Owner</option>
                        <option value="company_admin">Firma Admin</option>
                        <option value="company_user">Kullanıcı</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <StatusBadge label={user.is_active ? "Aktif" : "Pasif"} tone={user.is_active ? "success" : "danger"} />
                    </td>
                    <td className="py-3">
                      <StatusBadge label={user.accepted_at ? "Kabul edildi" : user.invitation_status === "failed" ? "Hatalı" : "Bekliyor"} tone={user.accepted_at ? "success" : user.invitation_status === "failed" ? "danger" : "warning"} />
                    </td>
                    <td className="py-3 text-gray-500">{formatDate(user.last_sign_in_at)}</td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant={user.is_active ? "danger" : "primary"}
                        onClick={() => updateCompanyUser(user.id, { is_active: !user.is_active })}
                      >
                        {user.is_active ? "Pasifleştir" : "Aktifleştir"}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        className="ml-2"
                        disabled={deletingUserId === user.id}
                        onClick={() => deleteCompanyUser(user)}
                      >
                        {deletingUserId === user.id ? "Siliniyor..." : "Sil"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-sm font-semibold text-gray-950">Firma kullanıcısı yok</p>
            <p className="mt-1 text-sm text-gray-500">İlk owner daveti oluşturulduğunda kullanıcı burada listelenecek.</p>
          </div>
        )}
      </Card>
    </div>
  )
}

function Field({
  label,
  value,
  helper,
  badge,
  muted = false,
}: {
  label: string
  value?: string
  helper?: string
  badge?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-3 min-h-7">
        {badge || <p className={muted ? "text-sm font-medium text-gray-400" : "text-sm font-semibold text-gray-950"}>{value}</p>}
      </div>
      {helper && <p className="mt-2 text-xs leading-5 text-gray-500">{helper}</p>}
    </div>
  )
}

function EditableField({
  label,
  value,
  placeholder,
  maxLength,
  type = "text",
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  maxLength?: number
  type?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <Input
        className="mt-3"
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function SenderHeaderSelect({
  value,
  headers,
  isTestMode,
  onChange,
}: {
  value: string
  headers: Array<{ header: string; status: string }>
  isTestMode: boolean
  onChange: (value: string) => void
}) {
  const approvedHeaders = headers.filter((item) => item.status === "approved")

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sender Header</p>
      {isTestMode ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm font-semibold text-gray-900">
          {value || "MSGNEX"}
        </div>
      ) : (
        <select
          value={value}
          disabled={approvedHeaders.length === 0}
          onChange={(event) => onChange(event.target.value)}
          className="mt-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">Sağlayıcıdan sorgulanan başlık seçin</option>
          {approvedHeaders.map((item) => (
            <option key={item.header} value={item.header}>{item.header}</option>
          ))}
        </select>
      )}
      <p className="mt-2 text-xs leading-5 text-gray-500">
        Başlık manuel girilemez. Netgsm hesabında onaylı görünen başlıklar arasından seçim yapılır.
      </p>
    </div>
  )
}

function SecretField({
  hasSecret,
  changedAt,
  value,
  onChange,
}: {
  hasSecret: boolean
  changedAt?: string | null
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Secret</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge label={hasSecret ? "Secret kayıtlı" : "Henüz girilmedi"} tone={hasSecret ? "success" : "warning"} />
        {hasSecret && <span className="font-mono text-sm text-gray-500">••••••••</span>}
      </div>
      {hasSecret && <p className="mt-2 text-xs text-gray-500">Son değişiklik: {formatDate(changedAt)}</p>}
      <Input
        className="mt-3"
        type="password"
        value={value}
        placeholder={hasSecret ? "Değiştirmek için yeni secret girin" : "Yeni provider kaydı için zorunlu"}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="mt-2 text-xs leading-5 text-gray-500">Boş bırakırsanız mevcut secret korunur. Gerçek secret frontend’e dönmez.</p>
    </div>
  )
}

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-700">{label}</span>
      <StatusBadge label={done ? "Tamam" : "Bekliyor"} tone={done ? "success" : "warning"} />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-semibold text-gray-950">{value}</span>
    </div>
  )
}

function PlanFeatureBox({ title, enabled }: { title: string; enabled: boolean }) {
  return (
    <div className={enabled ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900" : "rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-500"}>
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-xs">{enabled ? "Aktif" : "Kapalı"}</p>
    </div>
  )
}

function LimitBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900">
      <p className="text-xs font-semibold uppercase text-slate-500">{title}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  )
}

function OnboardingCheck({ label, done }: { label: string; done: boolean }) {
  return (
    <div className={done ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4" : "rounded-lg border border-amber-200 bg-amber-50 p-4"}>
      <p className={done ? "text-sm font-semibold text-emerald-950" : "text-sm font-semibold text-amber-950"}>{label}</p>
      <p className={done ? "mt-2 text-xs text-emerald-700" : "mt-2 text-xs text-amber-700"}>{done ? "Tamam" : "Bekliyor"}</p>
    </div>
  )
}
