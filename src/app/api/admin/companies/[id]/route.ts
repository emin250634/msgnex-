import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { writeAuditLog } from "@/lib/audit-log"

interface RouteContext {
  params: {
    id: string
  }
}

async function deleteUserIfOrphan(adminClient: any, userId: string, deletedCompanyId: string) {
  const [{ count }, { data: profile }, { data: memberships }] = await Promise.all([
    adminClient
      .from("company_users")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    adminClient
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .maybeSingle(),
    adminClient
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", userId)
      .limit(1),
  ])

  if (profile?.role === "admin") return

  if ((count ?? 0) === 0) {
    const { error } = await adminClient.auth.admin.deleteUser(userId, false)
    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes("not found")) {
        await adminClient.from("profiles").delete().eq("id", userId)
        return
      }
      throw new Error(`Kullanici silinemedi (${userId}): ${error.message}`)
    }
    return
  }

  if (profile?.company_id === deletedCompanyId || profile?.company_id === null) {
    const nextMembership = memberships?.[0]
    if (nextMembership?.company_id) {
      await adminClient
        .from("profiles")
        .update({
          company_id: nextMembership.company_id,
          role: nextMembership.role,
          is_active: true,
        })
        .eq("id", userId)
    }
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile, userId } = auth.context
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", params.id)
      .maybeSingle()

    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 })
    if (!company) return NextResponse.json({ error: "Firma bulunamadi" }, { status: 404 })

    const [
      { data: memberships, error: membershipError },
      { data: legacyProfiles, error: legacyProfilesError },
    ] = await Promise.all([
      adminClient
        .from("company_users")
        .select("user_id")
        .eq("company_id", params.id),
      adminClient
        .from("profiles")
        .select("id")
        .eq("company_id", params.id),
    ])

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })
    if (legacyProfilesError) return NextResponse.json({ error: legacyProfilesError.message }, { status: 500 })

    const userIds = Array.from(new Set([
      ...(memberships ?? []).map((row: any) => row.user_id).filter(Boolean),
      ...(legacyProfiles ?? []).map((row: any) => row.id).filter(Boolean),
    ]))

    const { error: deleteError } = await adminClient
      .from("companies")
      .delete()
      .eq("id", params.id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    for (const userId of userIds) {
      await deleteUserIfOrphan(adminClient, userId, params.id)
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: "company.delete",
      targetType: "company",
      targetId: params.id,
      companyId: params.id,
      metadata: {
        affected_user_count: userIds.length,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}
