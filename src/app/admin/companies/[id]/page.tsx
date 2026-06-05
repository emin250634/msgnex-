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
}

interface ProviderFormState {
  usercode: string
  secret: string
  senderHeader: string
  timeoutMs: string
  encoding: string
  isActive: boolean
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

function statusTone(status?: string | null) {
  if (status === "connected" || status === "approved" || status === "synced") return "success" as const
  if (status === "error" || status === "rejected") return "danger" as const
  if (status === "disabled") return "neutral" as const
  return "warning" as const
}

function formFromSettings(data: ProviderSettingsResponse): ProviderFormState {
  const settings = data.provider_settings
  return {
    usercode: settings.usercode || "",
    secret: "",
    senderHeader: settings.sender_header || "",
    timeoutMs: String(settings.timeout_ms || 15000),
    encoding: settings.encoding || "TR",
    isActive: settings.is_active,
  }
}

export default function AdminCompanyDetailPage() {
  const params = useParams<{ id: string }>()
  const [company, setCompany] = useState<Company | null>(null)
  const [providerData, setProviderData] = useState<ProviderSettingsResponse | null>(null)
  const [companyUsers, setCompanyUsers] = useState<CompanyUserRow[]>([])
  const [form, setForm] = useState<ProviderFormState>({
    usercode: "",
    secret: "",
    senderHeader: "",
    timeoutMs: "15000",
    encoding: "TR",
    isActive: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
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
    const [{ data: companyData }, providerResponse, usersResponse] = await Promise.all([
      supabase.from("companies").select("*").eq("id", params.id).maybeSingle(),
      fetch(`/api/admin/companies/${params.id}/provider-settings`),
      fetch(`/api/admin/companies/${params.id}/users`),
    ])

    if (!companyData) {
      setCompany(null)
      setLoading(false)
      return
    }
    setCompany(companyData)

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
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const settings = providerData?.provider_settings
  const wallet = providerData?.wallet
  const hasProviderRecord = Boolean(settings?.created_at)

  const providerHealth = useMemo(() => {
    if (!settings?.is_active) return { label: "Hazır değil", tone: "warning" as const }
    if (settings.connection_status === "connected" && settings.sender_header_status === "approved") {
      return { label: "Gönderime Hazır", tone: "success" as const }
    }
    return { label: "Yapılandırma bekliyor", tone: "warning" as const }
  }, [settings])

  const providerChecklist = useMemo(() => [
    { label: "Provider kaydı", done: hasProviderRecord },
    { label: "Netgsm usercode kaydı", done: Boolean(settings?.usercode) },
    { label: "Encrypted secret kaydı", done: Boolean(settings?.has_secret) },
    { label: "Başlık bilgisi", done: Boolean(settings?.sender_header) },
    { label: "Bakiye senkronizasyonu", done: Boolean(wallet?.last_synced_at) },
  ], [hasProviderRecord, settings?.has_secret, settings?.sender_header, settings?.usercode, wallet?.last_synced_at])

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
        <p>Test bağlantısı, başlık sorgulama, bakiye yenileme ve worker credential entegrasyonu henüz yapılmaz.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Sağlayıcı" value={hasProviderRecord ? "Netgsm" : "Henüz bağlanmadı"} description="Firma bazlı provider" tone="slate" icon={<span className="font-semibold">NG</span>} />
        <StatCard title="Bağlantı" value={connectionLabel(settings?.connection_status)} description="Test bağlantısı bu fazda yok" tone={settings?.connection_status === "connected" ? "emerald" : "amber"} icon={<span className="font-semibold">API</span>} />
        <StatCard title="Netgsm Bakiyesi" value={wallet ? wallet.balance.toLocaleString("tr-TR") : "-"} description={wallet ? `${wallet.balance_unit || "sms"} / ${wallet.currency || "TRY"}` : "Sync yok"} tone="slate" icon={<span className="font-semibold">₺</span>} />
        <StatCard title="Provider Sağlığı" value={providerHealth.label} description="Connected test yapılmadan hazır sayılmaz" tone={providerHealth.tone === "success" ? "emerald" : "amber"} icon={<span className="font-semibold">ST</span>} />
      </div>

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
            <Button variant="secondary" disabled>Test Bağlantısı</Button>
            <Button variant="secondary" disabled>Başlıkları Sorgula</Button>
            <Button variant="secondary" disabled>Bakiye Yenile</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 pt-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sağlayıcı" value={hasProviderRecord ? "Netgsm" : "Henüz bağlanmadı"} />
            <Field label="Durum" badge={<StatusBadge label={settings?.is_active ? "Aktif" : "Pasif"} tone={settings?.is_active ? "success" : "neutral"} />} />
            <EditableField
              label="Usercode"
              value={form.usercode}
              placeholder="Henüz girilmedi"
              onChange={(value) => setForm((state) => ({ ...state, usercode: value }))}
            />
            <SecretField
              hasSecret={Boolean(settings?.has_secret)}
              changedAt={settings?.secret_last_changed_at}
              value={form.secret}
              onChange={(value) => setForm((state) => ({ ...state, secret: value }))}
            />
            <EditableField
              label="Sender Header"
              value={form.senderHeader}
              placeholder="Henüz girilmedi"
              maxLength={11}
              onChange={(value) => setForm((state) => ({ ...state, senderHeader: value.toUpperCase() }))}
            />
            <Field label="Başlık Durumu" badge={<StatusBadge label={headerStatusLabel(settings?.sender_header_status)} tone={statusTone(settings?.sender_header_status)} />} />
            <Field label="Son Bağlantı Testi" value="Yok" />
            <Field label="Son Bakiye Sync" value={formatDate(wallet?.last_synced_at)} />
            <Field label="Güncel Bakiye" value={wallet ? `${wallet.balance.toLocaleString("tr-TR")} ${wallet.balance_unit || "sms"} ${wallet.currency || ""}` : "-"} />
            <Field label="Son Hata" value={settings?.connection_status === "error" ? "Provider bağlantısı hatalı" : "Yok"} muted={settings?.connection_status !== "error"} />
            <EditableField
              label="Encoding"
              value={form.encoding}
              placeholder="TR"
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
                    Kaydedilse bile bağlantı testi yapılmadığı için durum connected olmaz.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <p className="text-sm font-semibold text-gray-950">Wallet</p>
              <div className="mt-4 space-y-3 text-sm">
                <InfoRow label="Bakiye" value={wallet ? `${wallet.balance.toLocaleString("tr-TR")} ${wallet.balance_unit || "sms"}` : "-"} />
                <InfoRow label="Para Birimi" value={wallet?.currency || "-"} />
                <InfoRow label="Sync Durumu" value={syncStatusLabel(wallet?.sync_status)} />
                <InfoRow label="Son Sync" value={formatDate(wallet?.last_synced_at)} />
                <InfoRow label="Sync Hatası" value={wallet?.last_sync_error || "Yok"} />
              </div>
            </div>
          </aside>
        </div>
      </Card>

      <Card title="Kullanıcılar">
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Firma kullanıcıları Supabase davet akışıyla şifrelerini kendileri belirler. Admin kullanıcı şifresini göremez.
        </div>

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
            <Button onClick={handleInvite} disabled={inviting}>
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
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  maxLength?: number
  type?: string
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
        onChange={(event) => onChange(event.target.value)}
      />
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
