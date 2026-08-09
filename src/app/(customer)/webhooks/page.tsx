"use client"

import { useEffect, useMemo, useState } from "react"
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
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import type { CompanyWebhook, WebhookDelivery } from "@/types"

const WEBHOOK_EVENTS = [
  { value: "campaign.completed", label: "Kampanya tamamlandı" },
  { value: "sms.failed", label: "SMS başarısız oldu" },
  { value: "provider.status_updated", label: "Provider sonucu güncellendi" },
]

function eventLabel(value: string) {
  return WEBHOOK_EVENTS.find((event) => event.value === value)?.label || value
}

function deliveryLabel(value?: string | null) {
  if (value === "success") return "Başarılı"
  if (value === "failed") return "Hatalı"
  if (value === "queued") return "Kuyrukta"
  if (value === "processing") return "İşleniyor"
  return "Henüz gönderim yok"
}

function deliveryTone(value?: string | null) {
  if (value === "success") return "success" as const
  if (value === "failed") return "danger" as const
  if (value === "queued" || value === "processing") return "warning" as const
  return "neutral" as const
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return "{}"
  }
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<CompanyWebhook[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [plan, setPlan] = useState<{ plan: CompanyPlan; has_webhook: boolean } | null>(null)
  const [endpointUrl, setEndpointUrl] = useState("")
  const [events, setEvents] = useState<string[]>(["campaign.completed"])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const selectedWebhook = useMemo(() => webhooks.find((item) => item.id === editingId) ?? null, [editingId, webhooks])

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const [{ data: planRows, error: planError }, { data: webhookRows, error: webhookError }, { data: deliveryRows, error: deliveryError }] = await Promise.all([
      supabase.rpc("get_customer_plan"),
      supabase.rpc("list_company_webhooks"),
      supabase.rpc("list_company_webhook_deliveries", { p_limit: 50 }),
    ])

    if (planError) {
      setError(planError.message)
      toast.error(planError.message)
    }
    if (webhookError && !String(webhookError.message).includes("Webhook access requires")) {
      setError(webhookError.message)
      toast.error(webhookError.message)
    }
    if (deliveryError && !String(deliveryError.message).includes("does not exist")) {
      setError(deliveryError.message)
      toast.error(deliveryError.message)
    }

    setPlan(planRows?.[0] ?? null)
    setWebhooks((webhookRows ?? []) as CompanyWebhook[])
    setDeliveries((deliveryRows ?? []) as WebhookDelivery[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setEndpointUrl("")
    setEvents(["campaign.completed"])
    setEditingId(null)
    setIsActive(true)
  }

  const startEdit = (webhook: CompanyWebhook) => {
    setEditingId(webhook.id)
    setEndpointUrl(webhook.endpoint_url)
    setEvents(webhook.events)
    setIsActive(webhook.is_active)
  }

  const toggleEvent = (event: string) => {
    setEvents((current) => {
      if (current.includes(event)) return current.filter((item) => item !== event)
      return [...current, event]
    })
  }

  const saveWebhook = async () => {
    if (!plan?.has_webhook) {
      toast.error("Webhook erişimi Ajans / Kurumsal plan gerektirir.")
      return
    }
    if (!endpointUrl.trim().startsWith("https://")) {
      toast.error("Webhook URL https:// ile başlamalıdır.")
      return
    }
    if (events.length === 0) {
      toast.error("En az bir event seçin.")
      return
    }

    setSaving(true)
    const supabase = createClient()
    const rpc = editingId
      ? supabase.rpc("update_company_webhook", {
        p_webhook_id: editingId,
        p_endpoint_url: endpointUrl.trim(),
        p_events: events,
        p_is_active: isActive,
      })
      : supabase.rpc("create_company_webhook", {
        p_endpoint_url: endpointUrl.trim(),
        p_events: events,
      })

    const { error: saveError } = await rpc
    setSaving(false)

    if (saveError) {
      toast.error(saveError.message)
      return
    }

    toast.success(editingId ? "Webhook güncellendi" : "Webhook oluşturuldu")
    resetForm()
    load()
  }

  const deleteWebhook = async (id: string) => {
    const confirmed = window.confirm("Bu webhook kaydını silmek istiyor musunuz?")
    if (!confirmed) return

    const supabase = createClient()
    const { error: deleteError } = await supabase.rpc("delete_company_webhook", { p_webhook_id: id })
    if (deleteError) {
      toast.error(deleteError.message)
      return
    }

    toast.success("Webhook silindi")
    if (editingId === id) resetForm()
    load()
  }

  const sendTestDelivery = async (id: string) => {
    setActionId(id)
    const supabase = createClient()
    const { error: testError } = await supabase.rpc("create_company_webhook_test_delivery", { p_webhook_id: id })
    setActionId(null)

    if (testError) {
      toast.error(testError.message)
      return
    }

    toast.success("Test delivery kuyruğa alındı")
    load()
  }

  const retryDelivery = async (id: string) => {
    setActionId(id)
    const supabase = createClient()
    const { data, error: retryError } = await supabase.rpc("retry_company_webhook_delivery", { p_delivery_id: id })
    setActionId(null)

    if (retryError) {
      toast.error(retryError.message)
      return
    }
    if (!data) {
      toast.error("Bu delivery tekrar kuyruğa alınamadı.")
      return
    }

    toast.success("Delivery tekrar kuyruğa alındı")
    load()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Webhooks" description="Dış sistemlerinize kampanya ve provider olaylarını iletmek için webhook uçları tanımlayın." />
        <LoadingState variant="table" rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Webhooks" description="Dış sistemlerinize kampanya ve provider olaylarını iletmek için webhook uçları tanımlayın." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  const hasWebhookAccess = Boolean(plan?.has_webhook)
  const deliveryStats = {
    queued: deliveries.filter((item) => item.status === "queued").length,
    processing: deliveries.filter((item) => item.status === "processing").length,
    success: deliveries.filter((item) => item.status === "success").length,
    failed: deliveries.filter((item) => item.status === "failed").length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description={`Kampanya ve provider olaylarını dış sistemlerinize iletmek için webhook uçları yönetin. Mevcut plan: ${plan ? PLAN_LABELS[plan.plan] : "-"}`}
      />

      {!hasWebhookAccess && (
        <Card>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-semibold">Webhook erişimi Ajans / Kurumsal planında aktiftir.</p>
            <p>Bu özellik dış CRM, ERP veya ajans sistemlerine olay bildirimi göndermek için kullanılır.</p>
            <Link href="/plan" className="mt-2 inline-block font-semibold text-amber-950 underline">Plan yükseltme talebi gönder</Link>
          </div>
        </Card>
      )}

      <Card title={selectedWebhook ? "Webhook Güncelle" : "Yeni Webhook"}>
        <div className="space-y-4">
          <Input
            label="Endpoint URL"
            placeholder="https://example.com/msgnex/webhook"
            value={endpointUrl}
            disabled={!hasWebhookAccess}
            onChange={(event) => setEndpointUrl(event.target.value)}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Eventler</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event.value} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={events.includes(event.value)}
                    disabled={!hasWebhookAccess}
                    onChange={() => toggleEvent(event.value)}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <span>
                    <span className="block font-semibold text-gray-950">{event.label}</span>
                    <span className="mt-1 block font-mono text-xs text-gray-500">{event.value}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {selectedWebhook && (
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                disabled={!hasWebhookAccess}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="font-medium text-gray-800">Webhook aktif olsun</span>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveWebhook} disabled={saving || !hasWebhookAccess}>
              {saving ? "Kaydediliyor..." : selectedWebhook ? "Güncelle" : "Oluştur"}
            </Button>
            {selectedWebhook && <Button variant="secondary" onClick={resetForm} disabled={saving}>Vazgeç</Button>}
          </div>
        </div>
      </Card>

      <Card title="Webhook Kayıtları">
        {webhooks.length > 0 ? (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <article key={webhook.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-all font-mono text-sm font-semibold text-gray-950">{webhook.endpoint_url}</p>
                      <StatusBadge label={webhook.is_active ? "Aktif" : "Pasif"} tone={webhook.is_active ? "success" : "neutral"} />
                      <StatusBadge label={deliveryLabel(webhook.last_delivery_status)} tone={deliveryTone(webhook.last_delivery_status)} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {webhook.events.map((event) => (
                        <span key={event} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {eventLabel(event)}
                        </span>
                      ))}
                    </div>
                    {webhook.last_delivery_error && <p className="mt-3 text-sm text-red-700">{webhook.last_delivery_error}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" disabled={!hasWebhookAccess || actionId === webhook.id || !webhook.is_active} onClick={() => sendTestDelivery(webhook.id)}>
                      {actionId === webhook.id ? "Kuyruğa alınıyor..." : "Test Gönder"}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={!hasWebhookAccess} onClick={() => startEdit(webhook)}>Düzenle</Button>
                    <Button variant="danger" size="sm" disabled={!hasWebhookAccess} onClick={() => deleteWebhook(webhook.id)}>Sil</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">WH</span>}
            title="Webhook kaydı yok"
            description="Ajans / Kurumsal plan ile dış sistemlerinize olay bildirimi göndermek için webhook uçları tanımlayabilirsiniz."
          />
        )}
      </Card>

      <Card title="Delivery Gözlemi">
        <div className="mb-5 grid gap-3 text-sm sm:grid-cols-4">
          <DeliveryMetric title="Kuyrukta" value={deliveryStats.queued} tone="warning" />
          <DeliveryMetric title="İşleniyor" value={deliveryStats.processing} tone="info" />
          <DeliveryMetric title="Başarılı" value={deliveryStats.success} tone="success" />
          <DeliveryMetric title="Hatalı" value={deliveryStats.failed} tone="danger" />
        </div>

        {deliveries.length > 0 ? (
          <div className="space-y-3">
            {deliveries.map((delivery) => (
              <article key={delivery.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={deliveryLabel(delivery.status)} tone={deliveryTone(delivery.status)} />
                      <span className="font-mono text-xs font-semibold text-gray-600">{delivery.event_type}</span>
                      {delivery.response_status && <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">HTTP {delivery.response_status}</span>}
                    </div>
                    <p className="mt-3 break-all font-mono text-xs text-gray-700">{delivery.endpoint_url}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                      <span>Deneme: {delivery.attempts} / {delivery.max_attempts}</span>
                      <span>Oluşturma: {new Date(delivery.created_at).toLocaleString("tr-TR")}</span>
                      {delivery.delivered_at && <span>Teslim: {new Date(delivery.delivered_at).toLocaleString("tr-TR")}</span>}
                      {delivery.status === "failed" && <span>Sonraki deneme: {new Date(delivery.next_attempt_at).toLocaleString("tr-TR")}</span>}
                    </div>
                    {delivery.error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{delivery.error}</p>}
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Payload</p>
                      <pre className="max-h-56 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
                        {formatJson(delivery.payload)}
                      </pre>
                    </div>
                    {delivery.response_body && (
                      <pre className="mt-3 max-h-28 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
                        {delivery.response_body}
                      </pre>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {(delivery.status === "failed" || delivery.status === "success") && (
                      <Button variant="secondary" size="sm" disabled={!hasWebhookAccess || actionId === delivery.id} onClick={() => retryDelivery(delivery.id)}>
                        {actionId === delivery.id ? "Kuyruğa alınıyor..." : "Tekrar Dene"}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">DL</span>}
            title="Delivery kaydı yok"
            description="Webhook eventleri kuyruğa alındığında gönderim denemeleri burada görüntülenecek."
          />
        )}
      </Card>

      <Card title="Event Hazırlığı">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <EventBox title="campaign.completed" text="Kampanya tamamlandığında dış sisteme özet payload gönderimi için hazırlanır." />
          <EventBox title="sms.failed" text="Başarısız SMS kayıtlarını CRM veya destek sistemlerine taşımak için kullanılır." />
          <EventBox title="provider.status_updated" text="Provider DLR sonucu güncellendiğinde dış entegrasyona bildirim planlanır." />
          <EventBox title="webhook.test" text="Webhook URL ve imza doğrulamasını canlı SMS beklemeden test etmek için kullanılır." />
        </div>
      </Card>

      <Card title="İmza Doğrulama">
        <div className="space-y-5 text-sm">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 leading-6 text-blue-900">
            MSGNEX webhook isteği `X-MSGNEX-Signature` header&apos;ı ile imzalanır. İmzalanan metin `timestamp.body` formatındadır ve HMAC SHA-256 kullanılır.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <DocItem label="Event" value="X-MSGNEX-Event" />
            <DocItem label="Delivery ID" value="X-MSGNEX-Delivery" />
            <DocItem label="Timestamp" value="X-MSGNEX-Timestamp" />
            <DocItem label="Signature" value="X-MSGNEX-Signature: sha256=..." />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-semibold text-gray-950">Node.js doğrulama</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
{`import crypto from "crypto"

function verifyWebhook({ secret, timestamp, rawBody, signature }) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex")

  return signature === \`sha256=\${expected}\`
}`}
              </pre>
            </div>
            <div>
              <p className="mb-2 font-semibold text-gray-950">PHP doğrulama</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
{`$timestamp = $_SERVER["HTTP_X_MSGNEX_TIMESTAMP"];
$signature = $_SERVER["HTTP_X_MSGNEX_SIGNATURE"];
$rawBody = file_get_contents("php://input");

$expected = "sha256=" . hash_hmac(
  "sha256",
  $timestamp . "." . $rawBody,
  $secret
);

$valid = hash_equals($expected, $signature);`}
              </pre>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function DocItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-gray-950">{value}</p>
    </div>
  )
}

function DeliveryMetric({ title, value, tone }: { title: string; value: number; tone: "warning" | "info" | "success" | "danger" }) {
  const classes = {
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  }

  return (
    <div className={`rounded-lg border p-4 ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-75">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function EventBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="font-mono text-xs font-semibold text-gray-950">{title}</p>
      <p className="mt-2 leading-6 text-gray-600">{text}</p>
    </div>
  )
}
