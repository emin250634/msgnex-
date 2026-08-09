import { createHmac } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"

const requestSchema = z.object({
  maxDeliveries: z.number().int().min(1).max(100).default(20),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
})

interface ClaimedWebhookDelivery {
  id: string
  webhook_id: string
  endpoint_url: string
  signing_secret: string
  event_type: string
  payload: unknown
  attempts: number
}

function isAuthorized(request: Request): boolean {
  const workerSecret = process.env.WORKER_SECRET
  const authorization = request.headers.get("authorization")
  return Boolean(workerSecret && authorization === `Bearer ${workerSecret}`)
}

function signPayload(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

async function postWebhook(delivery: ClaimedWebhookDelivery, timeoutMs: number) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event_type,
    attempt: delivery.attempts,
    createdAt: new Date().toISOString(),
    data: delivery.payload,
  })
  const signature = signPayload(delivery.signing_secret, timestamp, body)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(delivery.endpoint_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MSGNEX-Webhooks/1.0",
        "X-MSGNEX-Event": delivery.event_type,
        "X-MSGNEX-Delivery": delivery.id,
        "X-MSGNEX-Timestamp": timestamp,
        "X-MSGNEX-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    })

    const responseBody = await response.text().catch(() => "")
    return {
      success: response.ok,
      responseStatus: response.status,
      responseBody,
      error: response.ok ? "" : `Webhook HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      success: false,
      responseStatus: null,
      responseBody: "",
      error: error instanceof Error ? error.message : "Webhook request failed",
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Worker yetkisi gerekli" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Worker isteği geçersiz" }, { status: 400 })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Worker ayarları eksik" },
      { status: 500 }
    )
  }

  const { data: deliveries, error: claimError } = await supabase.rpc("claim_webhook_deliveries", {
    p_limit: parsed.data.maxDeliveries,
  })

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })

  const processed = []
  for (const delivery of (deliveries ?? []) as ClaimedWebhookDelivery[]) {
    const result = await postWebhook(delivery, parsed.data.timeoutMs)
    const { error: completeError } = await supabase.rpc("complete_webhook_delivery", {
      p_delivery_id: delivery.id,
      p_success: result.success,
      p_response_status: result.responseStatus,
      p_response_body: result.responseBody,
      p_error: result.error,
    })

    if (completeError) {
      processed.push({
        id: delivery.id,
        event: delivery.event_type,
        ok: false,
        error: completeError.message,
      })
      continue
    }

    processed.push({
      id: delivery.id,
      event: delivery.event_type,
      ok: result.success,
      responseStatus: result.responseStatus,
    })
  }

  return NextResponse.json({
    processedCount: processed.length,
    deliveries: processed,
  })
}
