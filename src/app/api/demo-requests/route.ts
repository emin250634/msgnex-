import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

const VOLUMES = ["1.000 altı", "1.000 - 10.000", "10.000 - 50.000", "50.000 - 250.000", "250.000+"]

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength)
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
    const message = clean(body.message, 1500)

    if (!fullName || !companyName || !phone || !email || !monthlySmsVolume) {
      return NextResponse.json({ error: "Zorunlu alanları eksiksiz doldurun." }, { status: 400 })
    }
    if (!email.includes("@") || !VOLUMES.includes(monthlySmsVolume)) {
      return NextResponse.json({ error: "E-posta veya SMS hacmi geçersiz." }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.from("demo_requests").insert({
      full_name: fullName,
      company_name: companyName,
      phone,
      email,
      monthly_sms_volume: monthlySmsVolume,
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
