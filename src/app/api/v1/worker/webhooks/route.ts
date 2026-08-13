import { createHmac } from "crypto"
import { request as httpsRequest } from "node:https"
import type { IncomingHttpHeaders, IncomingMessage } from "node:http"
import { isIP } from "node:net"
import { NextResponse } from "next/server"
import { z } from "zod"
import { hasValidWorkerAuthorization } from "@/lib/security/worker-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  MAX_WEBHOOK_REDIRECTS,
  MAX_WEBHOOK_RESPONSE_BODY_BYTES,
  WEBHOOK_URL_BLOCKED,
  resolveWebhookUrlForDelivery,
  validateRedirectTarget,
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

function signPayload(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

type PinnedWebhookResponse = {
  status: number
  headers: IncomingHttpHeaders
  body: string
}

async function readLimitedResponseBody(response: IncomingMessage) {
  const chunks: Buffer[] = []
  let received = 0

  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    if (received >= MAX_WEBHOOK_RESPONSE_BODY_BYTES) continue

    const remaining = MAX_WEBHOOK_RESPONSE_BODY_BYTES - received
    const selected = buffer.byteLength > remaining ? buffer.subarray(0, remaining) : buffer
    chunks.push(selected)
    received += selected.byteLength
  }

  return Buffer.concat(chunks, received).toString("utf8")
}

function postPinnedWebhookRequest(
  url: URL,
  pinnedAddress: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<PinnedWebhookResponse> {
  return new Promise((resolve, reject) => {
    const outbound = httpsRequest(
      url,
      {
        method: "POST",
        headers,
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress, isIP(pinnedAddress))
        },
        servername: url.hostname,
      },
      async (response) => {
        try {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: await readLimitedResponseBody(response),
          })
        } catch (error) {
          reject(error)
        }
      }
    )

    outbound.setTimeout(timeoutMs, () => {
      outbound.destroy(new Error("Webhook request timed out"))
    })
    outbound.on("error", reject)
    outbound.write(body)
    outbound.end()
  })
}

async function postWebhook(delivery: ClaimedWebhookDelivery, timeoutMs: number) {
  let targetUrl: URL
  let pinnedAddress: string
  try {
    const resolved = await resolveWebhookUrlForDelivery(delivery.endpoint_url)
    targetUrl = resolved.url
    pinnedAddress = resolved.pinnedAddress
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
  try {
    const visitedUrls = new Set<string>()

    for (let redirectCount = 0; redirectCount <= MAX_WEBHOOK_REDIRECTS; redirectCount += 1) {
      if (visitedUrls.has(targetUrl.toString())) {
        throw new WebhookUrlBlockedError("Webhook redirect loop blocked")
      }
      visitedUrls.add(targetUrl.toString())

      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = signPayload(delivery.signing_secret, timestamp, body)
      const response = await postPinnedWebhookRequest(
        targetUrl,
        pinnedAddress,
        {
          "Content-Type": "application/json",
          "User-Agent": "MSGNEX-Webhooks/1.0",
          "X-MSGNEX-Event": delivery.event_type,
          "X-MSGNEX-Delivery": delivery.id,
          "X-MSGNEX-Timestamp": timestamp,
          "X-MSGNEX-Signature": `sha256=${signature}`,
        },
        body,
        timeoutMs
      )

      if (response.status >= 300 && response.status < 400) {
        const location = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location
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
        const resolved = await resolveWebhookUrlForDelivery(targetUrl.toString())
        targetUrl = resolved.url
        pinnedAddress = resolved.pinnedAddress
        continue
      }

      return {
        success: response.status >= 200 && response.status < 300,
        responseStatus: response.status,
        responseBody: response.body,
        error: response.status >= 200 && response.status < 300 ? "" : `Webhook HTTP ${response.status}`,
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
  }
}

export async function POST(request: Request) {
  if (!hasValidWorkerAuthorization(request)) {
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
