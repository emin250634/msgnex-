import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PLAN_IDS = ["starter", "professional", "agency"] as const

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isPlanId(value: string): value is (typeof PLAN_IDS)[number] {
  return PLAN_IDS.includes(value as (typeof PLAN_IDS)[number])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) return errorResponse("Giriş yapmanız gerekiyor.", 401)

  const body = await request.json().catch(() => ({}))
  const requestedPlan = String(body.requested_plan ?? "")
  const currentPlan = String(body.current_plan ?? "").trim() || null
  const message = String(body.message ?? "").trim().slice(0, 1000) || null

  if (!isPlanId(requestedPlan)) return errorResponse("Talep edilen plan geçersiz.")
  if (currentPlan && !isPlanId(currentPlan)) return errorResponse("Mevcut plan bilgisi geçersiz.")

  const { data: membership, error: membershipError } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    console.error("[plan-upgrade-requests:read-membership]", { userId: user.id, error: membershipError })
    return errorResponse("Firma üyeliği kontrol edilemedi.", 500)
  }

  let companyId = membership?.company_id as string | undefined
  if (!companyId) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("[plan-upgrade-requests:read-profile]", { userId: user.id, error: profileError })
      return errorResponse("Firma üyeliği kontrol edilemedi.", 500)
    }
    companyId = profile?.company_id as string | undefined
  }

  if (!companyId) return errorResponse("Aktif firma üyeliği bulunamadı.", 403)

  const { data, error } = await supabase
    .from("plan_upgrade_requests")
    .insert({
      company_id: companyId,
      requested_plan: requestedPlan,
      current_plan: currentPlan,
      message,
      requested_by: user.id,
    })
    .select("id, status, created_at")
    .single()

  if (error) {
    console.error("[plan-upgrade-requests:create]", { userId: user.id, companyId, requestedPlan, error })
    return errorResponse("Plan talebi oluşturulamadı.", 500)
  }

  return NextResponse.json({
    ok: true,
    request: data,
    message: "Plan talebiniz alındı. Ekibimiz sizinle iletişime geçecek.",
  })
}
