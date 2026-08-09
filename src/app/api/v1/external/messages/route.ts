import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptProviderSecret } from "@/lib/security/provider-secret"
import { createNetgsmProvider, createTestSmsProvider } from "@/services/sms-provider"
import type { SendSmsResult, SmsProvider } from "@/services/sms-provider"
import { MAX_SMS_LENGTH } from "@/lib/sms-segments"

const requestSchema = z.object({
  recipients: z.array(z.string()).min(1).max(1000),
  message: z.string().trim().min(1).max(MAX_SMS_LENGTH),
})

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  return authorization.slice(7).trim() || null
}

async function createProviderForCompany(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string
): Promise<SmsProvider> {
  const { data: setting, error } = await supabase
    .from("company_provider_settings")
    .select("provider_name, is_active, usercode, encrypted_secret, sender_header, timeout_ms, encoding")
    .eq("company_id", companyId)
    .eq("provider_name", "netgsm")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!setting || !setting.is_active || !setting.usercode || !setting.encrypted_secret || !setting.sender_header) {
    throw new Error("Firma Netgsm provider bağlantısı aktif değil")
  }

  if (setting.encoding === "TEST") {
    return createTestSmsProvider()
  }

  return createNetgsmProvider({
    userCode: setting.usercode,
    password: decryptProviderSecret(setting.encrypted_secret),
    defaultHeader: setting.sender_header,
    timeoutMs: setting.timeout_ms,
    encoding: setting.encoding,
  })
}

export async function POST(request: Request) {
  const apiKey = getBearerToken(request)
  const idempotencyKey = request.headers.get("idempotency-key")?.trim()

  if (!apiKey || !idempotencyKey) {
    return NextResponse.json(
      { error: "Authorization ve Idempotency-Key header alanlari gerekli" },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Alicilar veya mesaj formati gecersiz" }, { status: 400 })
  }

  const recipients = Array.from(new Set(parsed.data.recipients.map(normalizePhone).filter(Boolean)))
  if (recipients.length === 0 || recipients.some((recipient) => !/^\d{10,15}$/.test(recipient))) {
    return NextResponse.json({ error: "Gecerli bir telefon numarasi girin" }, { status: 400 })
  }

  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex")
  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "API ayarlari eksik" },
      { status: 500 }
    )
  }
  const { data: dispatch, error: dispatchError } = await supabase.rpc("create_api_sms_dispatch", {
    p_api_key_hash: apiKeyHash,
    p_idempotency_key: idempotencyKey,
    p_message: parsed.data.message,
    p_recipients: recipients,
  })

  if (dispatchError || !dispatch) {
    if (dispatchError?.message?.includes("API rate limit exceeded")) {
      return NextResponse.json(
        { error: dispatchError.message, retryAfterSeconds: dispatchError.message.includes("daily") ? 3600 : 60 },
        { status: 429, headers: { "Retry-After": dispatchError.message.includes("daily") ? "3600" : "60" } }
      )
    }
    return NextResponse.json({ error: dispatchError?.message || "Gonderim hazirlanamadi" }, { status: 400 })
  }

  if (dispatch.rate_limited) {
    const retryAfterSeconds = dispatch.retry_after_seconds ?? 60
    return NextResponse.json(
      { error: dispatch.message || "API rate limit exceeded", retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  if (!dispatch.created) {
    if (dispatch.status === "completed") return NextResponse.json({ ...dispatch.response, reused: true })
    return NextResponse.json({ error: "Bu istek halen isleniyor" }, { status: 409 })
  }

  let provider: SmsProvider
  let providerResults: SendSmsResult[]
  try {
    provider = await createProviderForCompany(supabase, dispatch.company_id)
    providerResults = await provider.sendBulkSms(
      dispatch.messages.map((item: { recipient: string }) => item.recipient),
      parsed.data.message,
      dispatch.sender_id
    )
  } catch {
    providerResults = dispatch.messages.map(() => ({
      success: false,
      messageId: null,
      error: "Provider istegi tamamlanamadi",
    }))
  }

  const results = providerResults.map((result, index) => ({
    id: dispatch.messages[index].id,
    success: result.success,
    accepted: result.accepted ?? result.success,
    provider_name: result.providerName ?? null,
    provider_bulk_id: result.providerBulkId ?? null,
    provider_message_id: result.messageId,
    provider_status_code: result.providerStatusCode ?? null,
    provider_status_text: result.providerStatusText ?? null,
    error: result.error ?? null,
    raw_status: result.rawStatus ?? null,
  }))

  const { data: completed, error: completionError } = await supabase.rpc("complete_api_sms_dispatch", {
    p_api_key_hash: apiKeyHash,
    p_request_id: dispatch.request_id,
    p_results: results,
  })

  if (completionError || !completed) {
    return NextResponse.json({ error: completionError?.message || "Gonderim sonucu kaydedilemedi" }, { status: 500 })
  }

  return NextResponse.json(completed)
}
