import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { getResetPasswordRedirectUrl } from "@/lib/utils/app-url"
import { isCompanyPlan } from "@/lib/plans"

const OWNER_ROLE = "company_owner"

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, userId } = auth.context
    const body = await request.json()
    const companyName = String(body.company_name ?? "").trim()
    const ownerName = String(body.owner_name ?? "").trim()
    const ownerEmail = String(body.owner_email ?? "").trim().toLowerCase()
    const phone = String(body.phone ?? "").trim() || null
    const status = String(body.status ?? "pending_provider_setup").trim()
    const plan = String(body.plan ?? "starter").trim()

    if (!companyName) return validationError("Firma adı zorunludur")
    if (!ownerName) return validationError("Yetkili adı zorunludur")
    if (!ownerEmail || !ownerEmail.includes("@")) return validationError("Geçerli yetkili e-posta adresi zorunludur")
    if (!["pending_review", "pending_provider_setup", "active", "suspended", "rejected"].includes(status)) {
      return validationError("Firma durumu geçersiz")
    }
    if (!isCompanyPlan(plan)) return validationError("Firma planı geçersiz")

    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .insert({
        name: companyName,
        phone,
        status,
        plan,
        is_active: status !== "suspended" && status !== "rejected",
        sender_name: "",
        sender_approved: false,
      })
      .select("id, name")
      .single()

    if (companyError || !company) {
      console.error("[admin-companies:create-company]", { userId, error: companyError })
      return NextResponse.json({ error: "Firma oluşturulamadı." }, { status: 500 })
    }

    const invite = await adminClient.auth.admin.inviteUserByEmail(ownerEmail, {
      data: {
        full_name: ownerName,
        role: OWNER_ROLE,
        company_id: company.id,
      },
      redirectTo: getResetPasswordRedirectUrl(request.nextUrl.origin),
    })

    if (invite.error || !invite.data.user) {
      await adminClient.from("companies").delete().eq("id", company.id)
      console.error("[admin-companies:invite-owner]", { userId, companyId: company.id, ownerEmail, error: invite.error })
      return NextResponse.json({ error: "Davet gönderilemedi." }, { status: 500 })
    }

    const invitedUser = invite.data.user
    await adminClient.from("profiles").upsert({
      id: invitedUser.id,
      full_name: ownerName,
      email: ownerEmail,
      role: OWNER_ROLE,
      company_id: company.id,
      is_active: true,
    })

    await adminClient.from("company_users").upsert({
      company_id: company.id,
      user_id: invitedUser.id,
      role: OWNER_ROLE,
      is_active: true,
      invited_at: new Date().toISOString(),
    }, { onConflict: "company_id,user_id" })

    await adminClient.from("company_invitations").upsert({
      company_id: company.id,
      user_id: invitedUser.id,
      email: ownerEmail,
      full_name: ownerName,
      role: OWNER_ROLE,
      status: "pending",
      invited_by: userId,
      invited_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "company_id,email" })

    return NextResponse.json({ company_id: company.id })
  } catch (error) {
    console.error("[admin-companies:create]", { error })
    return NextResponse.json(
      { error: "Firma oluşturma işlemi tamamlanamadı." },
      { status: 500 }
    )
  }
}
