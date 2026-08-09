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
  const setupSteps = [
    {
      label: "Firmanız adına Netgsm hesabı açılır",
      done: Boolean(status?.has_provider),
      detail: "SMS bakiyesi, sözleşme ve başlık sağlayıcı tarafında yönetilir.",
    },
    {
      label: "API kullanıcı bilgileri admin tarafından tanımlanır",
      done: Boolean(status?.has_provider),
      detail: "Secret bilgisi panelde gösterilmez; yalnızca güvenli bağlantı için saklanır.",
    },
    {
      label: "Sağlayıcıdan onaylı başlıklar sorgulanır",
      done: Boolean(status?.sender_header),
      detail: "Manuel başlık girilemez, sadece sağlayıcıdan dönen başlık kullanılır.",
    },
    {
      label: "Bağlantı ve kredi durumu kontrol edilir",
      done: status?.connection_status === "connected",
      detail: "Kredi yenileme MSGNEX'ten değil, firmanızın sağlayıcı hesabından yapılır.",
    },
    {
      label: "Gönderim ekranı kullanıma açılır",
      done: providerReady,
      detail: "Kampanyalar onaylı başlık ve firma sağlayıcı hesabı üzerinden kuyruğa alınır.",
    },
  ]

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

      <Card title="Kurulum Akışı">
        <div className="space-y-3">
          {setupSteps.map((step, index) => (
            <SetupStep
              key={step.label}
              index={index + 1}
              label={step.label}
              detail={step.detail}
              done={step.done}
            />
          ))}
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

      <Card title={providerReady ? "Sıradaki İşlem" : "Hazırlamanız Gerekenler"}>
        {providerReady ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-gray-600">
              Provider bağlantınız hazır. Kampanya oluşturmadan önce kişi listenizi ve kara liste kayıtlarınızı kontrol edin.
              Gönderim sorumluluğu, alıcı izinleri ve ticari elektronik ileti uygunluğu firmanıza aittir.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/sms" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                SMS Gönder
              </Link>
              <Link href="/suppression" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Kara Listeyi Kontrol Et
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <PreparationItem title="Netgsm hesabı" text="Hesap firmanız adına açılmış olmalı." />
            <PreparationItem title="Onaylı başlık" text="Gönderici başlığı sağlayıcı tarafında tanımlı olmalı." />
            <PreparationItem title="API bilgileri" text="Usercode ve secret admin tarafından güvenli şekilde bağlanmalı." />
          </div>
        )}
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

function SetupStep({ index, label, detail, done }: { index: number; label: string; detail: string; done: boolean }) {
  return (
    <div className="flex gap-4 rounded-xl border border-gray-100 p-4">
      <div className={done ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700" : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700"}>
        {done ? "✓" : index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-gray-950">{label}</p>
          <StatusBadge label={done ? "Tamam" : "Bekliyor"} tone={done ? "success" : "warning"} />
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-500">{detail}</p>
      </div>
    </div>
  )
}

function PreparationItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="font-semibold text-gray-950">{title}</p>
      <p className="mt-2 leading-6 text-gray-600">{text}</p>
    </div>
  )
}
