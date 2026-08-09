import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { getResetPasswordRedirectUrl } from "@/lib/utils/app-url"
import { PLAN_LIMITS, isCompanyPlan, type CompanyPlan } from "@/lib/plans"

const COMPANY_ROLES = ["company_owner", "company_admin", "company_user"]

interface RouteContext {
  params: {
    id: string
  }
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

async function ensureCompany(adminClient: any, companyId: string) {
  return adminClient
    .from("companies")
    .select("id, plan")
    .eq("id", companyId)
    .maybeSingle()
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient } = auth.context
    const { data: company, error: companyError } = await ensureCompany(adminClient, params.id)
    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 })
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

    const [{ data: memberships }, { data: invitations }] = await Promise.all([
      adminClient
        .from("company_users")
        .select("*")
        .eq("company_id", params.id)
        .order("created_at", { ascending: true }),
      adminClient
        .from("company_invitations")
        .select("*")
        .eq("company_id", params.id)
        .order("invited_at", { ascending: false }),
    ])

    const userIds = (memberships ?? []).map((membership: any) => membership.user_id).filter(Boolean)
    const { data: profiles } = userIds.length > 0
      ? await adminClient.from("profiles").select("id, full_name, email, role, is_active").in("id", userIds)
      : { data: [] }

    const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]))
    const invitationMap = new Map((invitations ?? []).map((invitation: any) => [invitation.user_id, invitation]))

    const users = (memberships ?? []).map((membership: any) => {
      const profile = profileMap.get(membership.user_id)
      const invitation = invitationMap.get(membership.user_id)
      return {
        id: membership.id,
        user_id: membership.user_id,
        full_name: profile?.full_name || invitation?.full_name || "-",
        email: profile?.email || invitation?.email || "-",
        role: membership.role,
        is_active: membership.is_active,
        invited_at: membership.invited_at,
        accepted_at: membership.accepted_at,
        invitation_status: invitation?.status || (membership.accepted_at ? "accepted" : "pending"),
        last_sign_in_at: null,
      }
    })

    return NextResponse.json({ users })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, userId } = auth.context
    const { data: company, error: companyError } = await ensureCompany(adminClient, params.id)
    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 })
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

    const body = await request.json()
    const email = String(body.email ?? "").trim().toLowerCase()
    const fullName = String(body.full_name ?? "").trim()
    const role = String(body.role ?? "company_user").trim()

    if (!email || !email.includes("@")) return validationError("Geçerli e-posta zorunludur")
    if (!fullName) return validationError("Ad soyad zorunludur")
    if (!COMPANY_ROLES.includes(role)) return validationError("Rol geçersiz")

    const companyPlan: CompanyPlan = isCompanyPlan(String(company.plan)) ? company.plan : "starter"
    const userLimit = PLAN_LIMITS[companyPlan].users
    const { count: currentUsers, error: countError } = await adminClient
      .from("company_users")
      .select("*", { count: "exact", head: true })
      .eq("company_id", params.id)
      .eq("is_active", true)

    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
    if ((currentUsers ?? 0) >= userLimit) {
      return validationError(`Bu plan en fazla ${userLimit} aktif kullanıcı destekler.`)
    }

    const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role,
        company_id: params.id,
      },
      redirectTo: getResetPasswordRedirectUrl(request.nextUrl.origin),
    })

    if (invite.error || !invite.data.user) {
      await adminClient.from("company_invitations").upsert({
        company_id: params.id,
        email,
        full_name: fullName,
        role,
        status: "failed",
        invited_by: userId,
        last_error: invite.error?.message || "Davet gönderilemedi",
      }, { onConflict: "company_id,email" })
      return NextResponse.json({ error: invite.error?.message || "Davet gönderilemedi" }, { status: 500 })
    }

    const invitedUser = invite.data.user
    await adminClient.from("profiles").upsert({
      id: invitedUser.id,
      full_name: fullName,
      email,
      role,
      company_id: params.id,
      is_active: true,
    })

    await adminClient.from("company_users").upsert({
      company_id: params.id,
      user_id: invitedUser.id,
      role,
      is_active: true,
      invited_at: new Date().toISOString(),
    }, { onConflict: "company_id,user_id" })

    await adminClient.from("company_invitations").upsert({
      company_id: params.id,
      user_id: invitedUser.id,
      email,
      full_name: fullName,
      role,
      status: "pending",
      invited_by: userId,
      invited_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "company_id,email" })

    return NextResponse.json({ user_id: invitedUser.id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}
