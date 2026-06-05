import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createSmsProvider } from "@/services/sms-provider"
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

  let provider: SmsProvider
  try {
    provider = createSmsProvider()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Provider ayarlari eksik" },
      { status: 503 }
    )
  }

  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex")
  const supabase = await createClient()
  const { data: dispatch, error: dispatchError } = await supabase.rpc("create_api_sms_dispatch", {
    p_api_key_hash: apiKeyHash,
    p_idempotency_key: idempotencyKey,
    p_message: parsed.data.message,
    p_recipients: recipients,
  })

  if (dispatchError || !dispatch) {
    return NextResponse.json({ error: dispatchError?.message || "Gonderim hazirlanamadi" }, { status: 400 })
  }

  if (!dispatch.created) {
    if (dispatch.status === "completed") return NextResponse.json({ ...dispatch.response, reused: true })
    return NextResponse.json({ error: "Bu istek halen isleniyor" }, { status: 409 })
  }

  let providerResults: SendSmsResult[]
  try {
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
    provider_message_id: result.messageId,
    error: result.error ?? null,
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
