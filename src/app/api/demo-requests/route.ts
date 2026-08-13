import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit, clientIpFromHeaders } from "@/lib/server-rate-limit"

const VOLUMES = ["1.000 altı", "1.000 - 10.000", "10.000 - 50.000", "50.000 - 250.000", "250.000+"]
const PROVIDER_STATUSES = ["yes", "no", "planning"]
const DEMO_REQUEST_IP_LIMIT = 5
const DEMO_REQUEST_EMAIL_LIMIT = 3
const DEMO_REQUEST_WINDOW_MS = 60 * 60 * 1000

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength)
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Çok fazla demo talebi gönderildi. Lütfen daha sonra tekrar deneyin." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (clean(body.website, 200)) {
      return NextResponse.json({ ok: true }, { status: 201 })
    }

    const fullName = clean(body.full_name, 120)
    const companyName = clean(body.company_name, 160)
    const phone = clean(body.phone, 30)
    const email = clean(body.email, 180).toLowerCase()
    const monthlySmsVolume = clean(body.monthly_sms_volume, 40)
    const hasSmsProvider = clean(body.has_sms_provider, 20)
    const smsProviderName = clean(body.sms_provider_name, 120)
    const message = clean(body.message, 1500)

    if (!fullName || !companyName || !phone || !email || !monthlySmsVolume || !hasSmsProvider) {
      return NextResponse.json({ error: "Zorunlu alanları eksiksiz doldurun." }, { status: 400 })
    }
    if (!email.includes("@") || !VOLUMES.includes(monthlySmsVolume)) {
      return NextResponse.json({ error: "E-posta veya SMS hacmi geçersiz." }, { status: 400 })
    }
    if (!PROVIDER_STATUSES.includes(hasSmsProvider)) {
      return NextResponse.json({ error: "SMS sağlayıcı bilgisi geçersiz." }, { status: 400 })
    }
    const clientIp = clientIpFromHeaders(request.headers)
    const ipLimit = await checkRateLimit({
      key: `demo-request:ip:${clientIp}`,
      limit: DEMO_REQUEST_IP_LIMIT,
      windowMs: DEMO_REQUEST_WINDOW_MS,
    })
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfterSeconds)
    }
    const emailLimit = await checkRateLimit({
      key: `demo-request:email:${email}`,
      limit: DEMO_REQUEST_EMAIL_LIMIT,
      windowMs: DEMO_REQUEST_WINDOW_MS,
    })
    if (!emailLimit.allowed) {
      return rateLimitedResponse(emailLimit.retryAfterSeconds)
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.from("demo_requests").insert({
      full_name: fullName,
      company_name: companyName,
      phone,
      email,
      monthly_sms_volume: monthlySmsVolume,
      has_sms_provider: hasSmsProvider,
      sms_provider_name: smsProviderName || null,
      message: message || null,
      status: "new",
    })

    if (error) throw error
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error("[demo-request-create]", error)
    return NextResponse.json({ error: "Demo talebiniz şu anda alınamadı." }, { status: 500 })
  }
}
