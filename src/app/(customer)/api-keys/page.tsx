"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import type { ApiKeyUsage, CustomerApiKey } from "@/types"

const API_LIMITS: Record<CompanyPlan, { perMinute: number; dailyGuidance: number; label: string }> = {
  starter: { perMinute: 0, dailyGuidance: 0, label: "API kapalı" },
  professional: { perMinute: 60, dailyGuidance: 10000, label: "Standart API kullanımı" },
  agency: { perMinute: 300, dailyGuidance: 100000, label: "Yüksek hacimli API kullanımı" },
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `mnx_${token}`
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<CustomerApiKey[]>([])
  const [usage, setUsage] = useState<Record<string, ApiKeyUsage>>({})
  const [plan, setPlan] = useState<{ plan: CompanyPlan; has_api_access: boolean } | null>(null)
  const [name, setName] = useState("")
  const [createdKey, setCreatedKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const [{ data, error: loadError }, { data: usageRows, error: usageError }, { data: planRows }] = await Promise.all([
      supabase.rpc("list_customer_api_keys"),
      supabase.rpc("list_customer_api_key_usage"),
      supabase.rpc("get_customer_plan"),
    ])
    if (loadError) {
      setError(loadError.message)
      toast.error(loadError.message)
    }
    if (usageError && !String(usageError.message).includes("does not exist")) {
      toast.error(usageError.message)
    }
    setKeys(data ?? [])
    setUsage(Object.fromEntries(((usageRows ?? []) as ApiKeyUsage[]).map((row) => [row.key_id, row])))
    setPlan(planRows?.[0] ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    if (!plan?.has_api_access) {
      toast.error("API erişimi Profesyonel veya Ajans planı gerektirir.")
      return
    }
    setSaving(true)
    const rawKey = generateApiKey()
    const supabase = createClient()
    const { error: createError } = await supabase.rpc("create_customer_api_key", {
      p_name: name.trim(),
      p_key_prefix: rawKey.slice(0, 16),
      p_key_hash: await sha256(rawKey),
    })

    setSaving(false)
    if (createError) {
      toast.error(createError.message)
      return
    }

    setName("")
    setCreatedKey(rawKey)
    toast.success("API anahtarı oluşturuldu")
    load()
  }

  const handleRevoke = async (id: string) => {
    const supabase = createClient()
    const { error: revokeError } = await supabase.rpc("revoke_customer_api_key", { p_key_id: id })
    if (revokeError) {
      toast.error(revokeError.message)
      return
    }
    toast.success("API anahtarı iptal edildi")
    load()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(createdKey)
    toast.success("API anahtarı panoya kopyalandı")
  }

  const currentLimits = API_LIMITS[plan?.plan ?? "starter"]

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Anahtarları" description="Kendi yazılımınızdan işlemsel SMS göndermek için güvenli API anahtarları oluşturun." />
        <LoadingState variant="table" rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Anahtarları" description="Kendi yazılımınızdan işlemsel SMS göndermek için güvenli API anahtarları oluşturun." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Anahtarları"
        description={`Kendi yazılımınızdan işlemsel SMS göndermek için güvenli API anahtarları oluşturun. Mevcut plan: ${plan ? PLAN_LABELS[plan.plan] : "-"}`}
      />

      <Card title="API Kullanım Limitleri">
        <div className="grid gap-3 md:grid-cols-3">
          <LimitBox title="Plan Durumu" value={currentLimits.label} />
          <LimitBox title="Dakikalık Limit" value={currentLimits.perMinute > 0 ? `${currentLimits.perMinute} istek/dk` : "Kapalı"} />
          <LimitBox title="Günlük Limit" value={currentLimits.dailyGuidance > 0 ? `${currentLimits.dailyGuidance.toLocaleString("tr-TR")} istek` : "Kapalı"} />
        </div>
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          API gönderimlerinde plan bazlı oran sınırlama uygulanır. Limit aşımında dış API `429` ve `Retry-After` header bilgisini döndürür; entegrasyonlarınızda idempotency ve retry mantığını buna göre planlayın.
        </div>
      </Card>

      {createdKey && (
        <Card title="Yeni API Anahtarınız">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Bu anahtar yalnızca bir kez gösterilir. Güvenli bir yerde saklayın.
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={createdKey} />
            <Button onClick={handleCopy}>Kopyala</Button>
          </div>
        </Card>
      )}

      <Card title="Yeni Anahtar Oluştur">
        {!plan?.has_api_access && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-semibold">API erişimi Profesyonel veya Ajans planında aktiftir.</p>
            <p>Bu özellik SMS kredisi satışı değildir; dış sistemlerden MSGNEX yazılım katmanına güvenli gönderim yetkisi sağlar.</p>
            <Link href="/plan" className="mt-2 inline-block font-semibold text-amber-950 underline">Planları incele</Link>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input label="Anahtar Adı" placeholder="Örn: CRM entegrasyonu" value={name} onChange={(event) => setName(event.target.value)} />
          <Button onClick={handleCreate} disabled={saving || !name.trim() || !plan?.has_api_access}>
            {saving ? "Oluşturuluyor..." : "Oluştur"}
          </Button>
        </div>
      </Card>

      <Card title="Mevcut Anahtarlar">
        {keys.length > 0 ? (
          <Table>
            <THead><Tr><Th>Ad</Th><Th>Anahtar Başlangıcı</Th><Th>Kullanım</Th><Th>Son 24 Saat</Th><Th>Son Kullanım</Th><Th>Durum</Th><Th></Th></Tr></THead>
            <TBody>
              {keys.map((key) => {
                const keyUsage = usage[key.id]
                const failed = keyUsage?.failed_messages ?? 0
                const success = keyUsage?.successful_messages ?? 0
                return (
                  <Tr key={key.id}>
                    <Td className="font-medium">{key.name}</Td>
                    <Td className="font-mono text-sm">{key.key_prefix}...</Td>
                    <Td>
                      <div className="text-sm font-semibold text-gray-950">{keyUsage?.total_requests ?? 0} istek</div>
                      <div className="text-xs text-gray-500">{success} başarılı / {failed} hatalı SMS</div>
                    </Td>
                    <Td>
                      <StatusBadge label={`${keyUsage?.requests_last_24h ?? 0} istek`} tone={(keyUsage?.requests_last_24h ?? 0) > currentLimits.dailyGuidance * 0.8 && currentLimits.dailyGuidance > 0 ? "warning" : "info"} />
                      {(keyUsage?.processing_requests ?? 0) > 0 && <div className="mt-1 text-xs text-amber-700">{keyUsage?.processing_requests} işleniyor</div>}
                    </Td>
                    <Td className="text-sm text-gray-500">{keyUsage?.last_request_at ? new Date(keyUsage.last_request_at).toLocaleString("tr-TR") : key.last_used_at ? new Date(key.last_used_at).toLocaleString("tr-TR") : "-"}</Td>
                    <Td><StatusBadge label={key.is_active ? "Aktif" : "İptal"} tone={key.is_active ? "success" : "neutral"} /></Td>
                    <Td>{key.is_active && <Button variant="danger" size="sm" onClick={() => handleRevoke(key.id)}>İptal Et</Button>}</Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">API</span>}
            title="Henüz API anahtarı yok"
            description="Entegrasyonlarınız için güvenli bir API anahtarı oluşturun."
            action={<Button variant="secondary" onClick={() => document.querySelector<HTMLInputElement>("input")?.focus()}>Anahtar Adı Gir</Button>}
          />
        )}
      </Card>

      <Card title="Geliştirici Rehberi">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm leading-6 text-gray-700">
            Endpoint, header, idempotency, request/response örnekleri ve hata durumları ayrı rehber sayfasında tutulur.
          </div>
          <Link href="/api-guide"><Button variant="secondary">API Rehberini Aç</Button></Link>
        </div>
      </Card>
    </div>
  )
}

function LimitBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-gray-950">{value}</p>
    </div>
  )
}
