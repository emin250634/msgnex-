import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { existingDispatchDecision, externalApiErrorResponse, rateLimitDecision } from "@/lib/api-dispatch-contract"
import { isValidSmsRecipient, normalizeUniqueTrPhones } from "@/lib/phone"
import { MAX_SMS_LENGTH } from "@/lib/sms-segments"
import { sendCampaignWithCompanyProvider } from "@/services/company-sms-provider"

const requestSchema = z.object({
  recipients: z.array(z.string()).min(1).max(1000),
  message: z.string().trim().min(1).max(MAX_SMS_LENGTH),
})

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  return authorization.slice(7).trim() || null
}

export async function POST(request: Request) {
  const apiKey = getBearerToken(request)
  const idempotencyKey = request.headers.get("idempotency-key")?.trim()

  if (!apiKey || !idempotencyKey) {
    return externalApiErrorResponse("INVALID_API_KEY", "Authorization ve Idempotency-Key header alanlari gerekli")
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return externalApiErrorResponse("INVALID_REQUEST", "Alicilar veya mesaj formati gecersiz")
  }

  const recipients = normalizeUniqueTrPhones(parsed.data.recipients)
  if (recipients.length === 0 || recipients.some((recipient) => !isValidSmsRecipient(recipient))) {
    return externalApiErrorResponse("INVALID_RECIPIENT", "Gecerli bir telefon numarasi girin")
  }

  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex")
  let supabase
  try {
    supabase = createAdminClient()
  } catch {
    return externalApiErrorResponse("INTERNAL_ERROR", "API ayarlari eksik")
  }

  const { data: dispatch, error: dispatchError } = await supabase.rpc("create_api_sms_dispatch", {
    p_api_key_hash: apiKeyHash,
    p_idempotency_key: idempotencyKey,
    p_message: parsed.data.message,
    p_recipients: recipients,
  })

  if (dispatchError || !dispatch) {
    return externalApiErrorResponse("DISPATCH_FAILED", "Gonderim hazirlanamadi")
  }

  const rateLimit = rateLimitDecision(dispatch)
  if (rateLimit) return NextResponse.json(rateLimit.body, { status: rateLimit.status, headers: rateLimit.headers })

  const existingDispatch = existingDispatchDecision(dispatch)
  if (existingDispatch) return NextResponse.json(existingDispatch.body, { status: existingDispatch.status })

  const results = await sendCampaignWithCompanyProvider(supabase, {
    companyId: dispatch.company_id,
    messages: dispatch.messages,
    message: parsed.data.message,
    senderId: dispatch.sender_id,
    failureMessage: "Provider istegi tamamlanamadi",
  })

  const { data: completed, error: completionError } = await supabase.rpc("complete_api_sms_dispatch", {
    p_api_key_hash: apiKeyHash,
    p_request_id: dispatch.request_id,
    p_results: results,
  })

  if (completionError || !completed) {
    return externalApiErrorResponse("INTERNAL_ERROR", "Gonderim sonucu kaydedilemedi")
  }

  return NextResponse.json(completed)
}
