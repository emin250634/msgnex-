import { createHmac } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  MAX_WEBHOOK_REDIRECTS,
  MAX_WEBHOOK_RESPONSE_BODY_BYTES,
  WEBHOOK_URL_BLOCKED,
  validateRedirectTarget,
  validateWebhookUrlForDelivery,
  WebhookUrlBlockedError,
} from "@/lib/security/webhook-url"

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

async function readLimitedResponseBody(response: Response) {
  if (!response.body) return ""

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (received < MAX_WEBHOOK_RESPONSE_BODY_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    const remaining = MAX_WEBHOOK_RESPONSE_BODY_BYTES - received
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
    chunks.push(chunk)
    received += chunk.byteLength

    if (value.byteLength > remaining) break
  }

  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(concatChunks(chunks, received))
}

function concatChunks(chunks: Uint8Array[], totalLength: number) {
  const output = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

async function postWebhook(delivery: ClaimedWebhookDelivery, timeoutMs: number) {
  let targetUrl: URL
  try {
    targetUrl = await validateWebhookUrlForDelivery(delivery.endpoint_url)
  } catch (error) {
    return {
      success: false,
      responseStatus: null,
      responseBody: "",
      error: error instanceof WebhookUrlBlockedError ? WEBHOOK_URL_BLOCKED : "Webhook URL validation failed",
    }
  }

  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event_type,
    attempt: delivery.attempts,
    createdAt: new Date().toISOString(),
    data: delivery.payload,
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const visitedUrls = new Set<string>()

    for (let redirectCount = 0; redirectCount <= MAX_WEBHOOK_REDIRECTS; redirectCount += 1) {
      if (visitedUrls.has(targetUrl.toString())) {
        throw new WebhookUrlBlockedError("Webhook redirect loop blocked")
      }
      visitedUrls.add(targetUrl.toString())

      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = signPayload(delivery.signing_secret, timestamp, body)
      const response = await fetch(targetUrl, {
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
        redirect: "manual",
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) {
          return {
            success: false,
            responseStatus: response.status,
            responseBody: "",
            error: `Webhook HTTP ${response.status}`,
          }
        }

        if (redirectCount === MAX_WEBHOOK_REDIRECTS) {
          throw new WebhookUrlBlockedError("Webhook redirect limit exceeded")
        }

        targetUrl = validateRedirectTarget(location, targetUrl)
        targetUrl = await validateWebhookUrlForDelivery(targetUrl.toString())
        continue
      }

      const responseBody = await readLimitedResponseBody(response).catch(() => "")
      return {
        success: response.ok,
        responseStatus: response.status,
        responseBody,
        error: response.ok ? "" : `Webhook HTTP ${response.status}`,
      }
    }

    throw new WebhookUrlBlockedError("Webhook redirect limit exceeded")
  } catch (error) {
    return {
      success: false,
      responseStatus: null,
      responseBody: "",
      error: error instanceof WebhookUrlBlockedError ? WEBHOOK_URL_BLOCKED : "Webhook request failed",
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
    console.error("[worker-webhooks:init]", { error })
    return NextResponse.json(
      { error: "Worker ayarları eksik" },
      { status: 500 }
    )
  }

  const { data: deliveries, error: claimError } = await supabase.rpc("claim_webhook_deliveries", {
    p_limit: parsed.data.maxDeliveries,
  })

  if (claimError) {
    console.error("[worker-webhooks:claim-deliveries]", { error: claimError })
    return NextResponse.json({ error: "Webhook teslimatları alınamadı." }, { status: 500 })
  }

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
      console.error("[worker-webhooks:complete-delivery]", { deliveryId: delivery.id, webhookId: delivery.webhook_id, error: completeError })
      processed.push({
        id: delivery.id,
        event: delivery.event_type,
        ok: false,
        error: "Webhook teslimatı tamamlanamadı.",
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
