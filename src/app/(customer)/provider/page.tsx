"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { createClient } from "@/lib/supabase/client"

interface ProviderStatus {
  provider_name: string
  connection_status: string
  sender_header: string | null
  sender_header_status: string
  has_provider: boolean
  balance: number | null
  balance_unit: string | null
  currency: string | null
  last_synced_at: string | null
  sync_status: string
}

function statusLabel(value?: string | null) {
  if (value === "connected") return "Bağlı"
  if (value === "disabled") return "Pasif"
  if (value === "failed") return "Hata"
  if (value === "not_configured") return "Kurulum Bekliyor"
  return "Kontrol Bekliyor"
}

function statusTone(value?: string | null) {
  if (value === "connected") return "success" as const
  if (value === "failed") return "danger" as const
  if (value === "disabled") return "neutral" as const
  return "warning" as const
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

export default function ProviderPage() {
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const supabase = createClient()
    supabase
      .rpc("get_customer_provider_status")
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setStatus(data?.[0] ?? null)
        setLoading(false)
      })
  }, [])

  if (loading) return <p>Yükleniyor...</p>

  const providerReady = Boolean(status?.has_provider && status.sender_header && status.connection_status !== "disabled")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider Bağlantısı"
        description="SMS gönderimleri firmanızın kendi Netgsm hesabı ve onaylı gönderici başlığı üzerinden yapılır."
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Provider durumu alınamadı: {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-gray-600">Provider</p>
          <p className="mt-3 text-3xl font-semibold text-gray-950">{status?.provider_name || "Netgsm"}</p>
          <div className="mt-4">
            <StatusBadge
              label={providerReady ? "Hazır" : statusLabel(status?.connection_status)}
              tone={providerReady ? "success" : statusTone(status?.connection_status)}
            />
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-gray-600">Gönderici Başlığı</p>
          <p className="mt-3 font-mono text-3xl font-semibold text-gray-950">{status?.sender_header || "-"}</p>
          <p className="mt-3 text-sm text-gray-500">Durum: {status?.sender_header_status || "unknown"}</p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-gray-600">Sağlayıcıdaki Kredi</p>
          <p className="mt-3 text-3xl font-semibold text-gray-950">
            {status?.balance != null ? status.balance.toLocaleString("tr-TR") : "-"}
          </p>
          <p className="mt-3 text-sm text-gray-500">
            {status?.balance_unit || "sms"} {status?.currency || ""} · Son sağlayıcı sorgusu: {formatDate(status?.last_synced_at)}
          </p>
        </Card>
      </div>

      <Card title="Kurulum Durumu">
        <div className="space-y-3 text-sm">
          <CheckRow label="Firma provider kaydı" done={Boolean(status?.has_provider)} />
          <CheckRow label="Netgsm kullanıcı bilgisi ve secret" done={Boolean(status?.has_provider)} />
          <CheckRow label="Gönderici başlığı tanımlı" done={Boolean(status?.sender_header)} />
          <CheckRow label="Gönderime hazır" done={providerReady} />
        </div>
      </Card>

      {!providerReady && (
        <Card>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            SMS gönderimi için Netgsm hesabınızın ve gönderici başlığınızın admin tarafından bağlanması gerekir.
            Başvuru Netgsm tarafında firmanız adına yapılmalı; MSGNEX yalnızca bu hesabın API bağlantısını kullanır.
          </div>
        </Card>
      )}

      <Card title="Sonraki Adım">
        <p className="text-sm leading-6 text-gray-600">
          Provider bağlantınız hazır olduğunda kampanyalarınızı <Link href="/sms" className="font-semibold text-blue-700 hover:text-blue-800">SMS Gönder</Link> ekranından kuyruğa alabilirsiniz.
          Gönderim sorumluluğu, alıcı izinleri ve ticari elektronik ileti uygunluğu firmanıza aittir.
        </p>
      </Card>
    </div>
  )
}

function CheckRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 p-3">
      <span className="font-medium text-gray-800">{label}</span>
      <StatusBadge label={done ? "Tamam" : "Bekliyor"} tone={done ? "success" : "warning"} />
    </div>
  )
}
