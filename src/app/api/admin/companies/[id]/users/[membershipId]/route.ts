import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"

const COMPANY_ROLES = ["company_owner", "company_admin", "company_user"]

interface RouteContext {
  params: {
    id: string
    membershipId: string
  }
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient } = auth.context
    const body = await request.json()
    const nextRole = body.role === undefined ? undefined : String(body.role).trim()
    const nextActive = body.is_active === undefined ? undefined : Boolean(body.is_active)

    if (nextRole !== undefined && !COMPANY_ROLES.includes(nextRole)) {
      return validationError("Rol geçersiz")
    }

    const { data: membership, error: membershipError } = await adminClient
      .from("company_users")
      .select("*")
      .eq("id", params.membershipId)
      .eq("company_id", params.id)
      .maybeSingle()

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })
    if (!membership) return NextResponse.json({ error: "Company user not found" }, { status: 404 })

    const ownerWillBeChanged =
      membership.role === "company_owner" &&
      ((nextRole !== undefined && nextRole !== "company_owner") || nextActive === false)

    if (ownerWillBeChanged) {
      const { count } = await adminClient
        .from("company_users")
        .select("*", { count: "exact", head: true })
        .eq("company_id", params.id)
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

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    if (nextRole !== undefined || nextActive !== undefined) {
      await adminClient
        .from("profiles")
        .update({
          ...(nextRole !== undefined ? { role: nextRole } : {}),
          ...(nextActive !== undefined ? { is_active: nextActive } : {}),
        })
        .eq("id", membership.user_id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}
