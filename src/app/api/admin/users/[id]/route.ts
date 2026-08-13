import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { writeAuditLog } from "@/lib/audit-log"
import { assertSameOriginRequest } from "@/lib/security/request-origin"

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const originError = assertSameOriginRequest(request)
  if (originError) return originError

  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile: actorProfile, userId } = auth.context
    const { id } = await params
    if (id === userId) {
      return NextResponse.json({ error: "Kendi admin kullanicinizi silemezsiniz" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", id)
      .maybeSingle()

    if (profileError) {
      console.error("[admin-users:delete:read-profile]", { targetUserId: id, actorUserId: userId, error: profileError })
      return NextResponse.json({ error: "Kullanıcı bilgisi okunamadı." }, { status: 500 })
    }
    if (!profile) return NextResponse.json({ error: "Kullanici bulunamadi" }, { status: 404 })
    if (profile.role === "admin") {
      return NextResponse.json({ error: "Admin kullanicilar bu ekrandan silinemez" }, { status: 400 })
    }

    const { error } = await adminClient.auth.admin.deleteUser(id, false)
    if (error) {
      if ((error as { status?: number }).status !== 404) {
        console.error("[admin-users:delete:auth-user]", { targetUserId: id, actorUserId: userId, error })
        return NextResponse.json({ error: "Kullanıcı silinemedi." }, { status: 500 })
      }

      await adminClient.from("company_users").delete().eq("user_id", id)
      await adminClient.from("company_invitations").delete().eq("user_id", id)
      await adminClient.from("profiles").delete().eq("id", id)
    }

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: actorProfile.role,
      action: "user.delete",
      targetType: "user",
      targetId: id,
      metadata: {
        deleted_user_role: profile.role,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[admin-users:delete:unexpected]", { error })
    return NextResponse.json(
      { error: "Kullanıcı silinemedi." },
      { status: 500 }
    )
  }
}
