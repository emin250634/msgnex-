import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { writeAuditLog } from "@/lib/audit-log"
import { isCompanyPlan } from "@/lib/plans"

const SALES_STATUSES = ["new", "contacted", "pilot", "won", "lost"]

interface RouteContext {
  params: Promise<{
    id: string
  }>
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile, userId } = auth.context
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const updates: Record<string, string | null> = {}
    const metadata: Record<string, unknown> = {}

    if ("plan" in body) {
      const plan = String(body.plan ?? "").trim()
      if (!isCompanyPlan(plan)) {
        return NextResponse.json({ error: "Firma planı geçersiz" }, { status: 400 })
      }
      updates.plan = plan
    }

    if ("sales_status" in body) {
      const salesStatus = String(body.sales_status ?? "").trim()
      if (!SALES_STATUSES.includes(salesStatus)) {
        return NextResponse.json({ error: "Satış durumu geçersiz" }, { status: 400 })
      }
      updates.sales_status = salesStatus
    }

    if ("pilot_started_at" in body) {
      const pilotStartedAt = String(body.pilot_started_at ?? "").trim()
      updates.pilot_started_at = pilotStartedAt || null
    }

    if ("expected_monthly_sms_volume" in body) {
      const expectedVolume = String(body.expected_monthly_sms_volume ?? "").trim().slice(0, 80)
      updates.expected_monthly_sms_volume = expectedVolume || null
    }

    if ("sales_note" in body) {
      const salesNote = String(body.sales_note ?? "").trim().slice(0, 2000)
      updates.sales_note = salesNote || null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan bulunamadı" }, { status: 400 })
    }

    const { data: currentCompany, error: currentError } = await adminClient
      .from("companies")
      .select("id, plan, sales_status, pilot_started_at, expected_monthly_sms_volume, sales_note")
      .eq("id", id)
      .maybeSingle()

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
    if (!currentCompany) return NextResponse.json({ error: "Firma bulunamadi" }, { status: 404 })

    const { data: company, error: updateError } = await adminClient
      .from("companies")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    if (!company) return NextResponse.json({ error: "Firma bulunamadi" }, { status: 404 })

    const currentValues = currentCompany as Record<string, unknown>
    for (const [key, value] of Object.entries(updates)) {
      metadata[key] = {
        previous: currentValues[key] ?? null,
        next: value,
      }
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: "company.update",
      targetType: "company",
      targetId: id,
      companyId: id,
      metadata,
    })

    return NextResponse.json({ company, message: "Firma güncellendi" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile, userId } = auth.context
    const { id } = await params
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", id)
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
        .eq("company_id", id),
      adminClient
        .from("profiles")
        .select("id")
        .eq("company_id", id),
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
      .eq("id", id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    for (const userId of userIds) {
      await deleteUserIfOrphan(adminClient, userId, id)
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: "company.delete",
      targetType: "company",
      targetId: id,
      companyId: id,
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
