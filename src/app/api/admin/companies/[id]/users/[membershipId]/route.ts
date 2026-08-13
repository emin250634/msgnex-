import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { writeAuditLog } from "@/lib/audit-log"
import { assertSameOriginRequest } from "@/lib/security/request-origin"

const COMPANY_ROLES = ["company_owner", "company_admin", "company_user"]

interface RouteContext {
  params: Promise<{
    id: string
    membershipId: string
  }>
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const originError = assertSameOriginRequest(request)
  if (originError) return originError

  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile, userId } = auth.context
    const { id, membershipId } = await params
    const body = await request.json()
    const nextRole = body.role === undefined ? undefined : String(body.role).trim()
    const nextActive = body.is_active === undefined ? undefined : Boolean(body.is_active)

    if (nextRole !== undefined && !COMPANY_ROLES.includes(nextRole)) {
      return validationError("Rol geçersiz")
    }

    const { data: membership, error: membershipError } = await adminClient
      .from("company_users")
      .select("*")
      .eq("id", membershipId)
      .eq("company_id", id)
      .maybeSingle()

    if (membershipError) {
      console.error("[admin-company-user:update:read-membership]", { companyId: id, membershipId, userId, error: membershipError })
      return NextResponse.json({ error: "Firma kullanıcısı okunamadı." }, { status: 500 })
    }
    if (!membership) return NextResponse.json({ error: "Firma kullanıcısı bulunamadı." }, { status: 404 })

    const ownerWillBeChanged =
      membership.role === "company_owner" &&
      ((nextRole !== undefined && nextRole !== "company_owner") || nextActive === false)

    if (ownerWillBeChanged) {
      const { count } = await adminClient
        .from("company_users")
        .select("*", { count: "exact", head: true })
        .eq("company_id", id)
        .eq("role", "company_owner")
        .eq("is_active", true)

      if ((count ?? 0) <= 1) {
        return validationError("Son aktif owner pasifleştirilemez veya rolü değiştirilemez")
      }
    }

    const updatePayload: Record<string, unknown> = {}
    if (nextRole !== undefined) updatePayload.role = nextRole
    if (nextActive !== undefined) updatePayload.is_active = nextActive

    if (Object.keys(updatePayload).length === 0) {
      return validationError("Güncellenecek alan yok")
    }

    const { error: updateError } = await adminClient
      .from("company_users")
      .update(updatePayload)
      .eq("id", membership.id)

    if (updateError) {
      console.error("[admin-company-user:update]", { companyId: id, membershipId, userId, error: updateError })
      return NextResponse.json({ error: "Firma kullanıcısı güncellenemedi." }, { status: 500 })
    }

    if (nextRole !== undefined || nextActive !== undefined) {
      await adminClient
        .from("profiles")
        .update({
          ...(nextRole !== undefined ? { role: nextRole } : {}),
          ...(nextActive !== undefined ? { is_active: nextActive } : {}),
        })
        .eq("id", membership.user_id)
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: "company_user.update",
      targetType: "company_user",
      targetId: membership.id,
      companyId: id,
      metadata: {
        user_id: membership.user_id,
        previous_role: membership.role,
        next_role: nextRole ?? membership.role,
        previous_is_active: membership.is_active,
        next_is_active: nextActive ?? membership.is_active,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const { id, membershipId } = await params
    console.error("[admin-company-user:update:unexpected]", { companyId: id, membershipId, error })
    return NextResponse.json(
      { error: "Firma kullanıcısı güncellenemedi." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const originError = assertSameOriginRequest(request)
  if (originError) return originError

  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile, userId } = auth.context
    const { id, membershipId } = await params
    const { data: membership, error: membershipError } = await adminClient
      .from("company_users")
      .select("*")
      .eq("id", membershipId)
      .eq("company_id", id)
      .maybeSingle()

    if (membershipError) {
      console.error("[admin-company-user:delete:read-membership]", { companyId: id, membershipId, userId, error: membershipError })
      return NextResponse.json({ error: "Firma kullanıcısı okunamadı." }, { status: 500 })
    }
    if (!membership) return NextResponse.json({ error: "Firma kullanıcısı bulunamadı." }, { status: 404 })

    if (membership.role === "company_owner") {
      const { count } = await adminClient
        .from("company_users")
        .select("*", { count: "exact", head: true })
        .eq("company_id", id)
        .eq("role", "company_owner")
        .eq("is_active", true)

      if ((count ?? 0) <= 1) {
        return validationError("Son aktif owner silinemez")
      }
    }

    const { error: deleteMembershipError } = await adminClient
      .from("company_users")
      .delete()
      .eq("id", membership.id)

    if (deleteMembershipError) {
      console.error("[admin-company-user:delete-membership]", { companyId: id, membershipId, userId, error: deleteMembershipError })
      return NextResponse.json({ error: "Firma kullanıcısı silinemedi." }, { status: 500 })
    }

    await adminClient
      .from("company_invitations")
      .delete()
      .eq("company_id", id)
      .eq("user_id", membership.user_id)

    const { count: remainingCount } = await adminClient
      .from("company_users")
      .select("*", { count: "exact", head: true })
      .eq("user_id", membership.user_id)

    if ((remainingCount ?? 0) === 0) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", membership.user_id)
        .maybeSingle()

      if (profile?.role !== "admin") {
        const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(membership.user_id, false)
        if (deleteUserError) {
          console.error("[admin-company-user:delete-auth-user]", { companyId: id, membershipId, targetUserId: membership.user_id, userId, error: deleteUserError })
          return NextResponse.json({ error: "Firma kullanıcısı silinemedi." }, { status: 500 })
        }
      }
    } else {
      const { data: nextMemberships } = await adminClient
        .from("company_users")
        .select("company_id, role, is_active")
        .eq("user_id", membership.user_id)
        .limit(1)

      const nextMembership = nextMemberships?.[0]
      if (nextMembership) {
        await adminClient
          .from("profiles")
          .update({
            company_id: nextMembership.company_id,
            role: nextMembership.role,
            is_active: nextMembership.is_active,
          })
          .eq("id", membership.user_id)
      }
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: "company_user.delete",
      targetType: "company_user",
      targetId: membership.id,
      companyId: id,
      metadata: {
        user_id: membership.user_id,
        role: membership.role,
        was_active: membership.is_active,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const { id, membershipId } = await params
    console.error("[admin-company-user:delete:unexpected]", { companyId: id, membershipId, error })
    return NextResponse.json(
      { error: "Firma kullanıcısı silinemedi." },
      { status: 500 }
    )
  }
}
