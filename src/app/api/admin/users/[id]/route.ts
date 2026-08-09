import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { writeAuditLog } from "@/lib/audit-log"

interface RouteContext {
  params: {
    id: string
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile: actorProfile, userId } = auth.context
    if (params.id === userId) {
      return NextResponse.json({ error: "Kendi admin kullanicinizi silemezsiniz" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", params.id)
      .maybeSingle()

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
    if (!profile) return NextResponse.json({ error: "Kullanici bulunamadi" }, { status: 404 })
    if (profile.role === "admin") {
      return NextResponse.json({ error: "Admin kullanicilar bu ekrandan silinemez" }, { status: 400 })
    }

    const { error } = await adminClient.auth.admin.deleteUser(params.id, false)
    if (error) {
      const message = error.message.toLowerCase()
      if (!message.includes("not found")) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      await adminClient.from("company_users").delete().eq("user_id", params.id)
      await adminClient.from("company_invitations").delete().eq("user_id", params.id)
      await adminClient.from("profiles").delete().eq("id", params.id)
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: actorProfile.role,
      action: "user.delete",
      targetType: "user",
      targetId: params.id,
      metadata: {
        deleted_user_role: profile.role,
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
