import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit, clientIpFromHeaders } from "@/lib/server-rate-limit"

const INVITATION_IP_LIMIT = 30
const INVITATION_USER_LIMIT = 10
const INVITATION_WINDOW_MS = 5 * 60 * 1000

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Çok fazla davet kabul denemesi yapıldı. Lütfen daha sonra tekrar deneyin." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const ipLimit = checkRateLimit({
      key: `accept-invitation:ip:${clientIpFromHeaders(request.headers)}`,
      limit: INVITATION_IP_LIMIT,
      windowMs: INVITATION_WINDOW_MS,
    })
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfterSeconds)
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    const userLimit = checkRateLimit({
      key: `accept-invitation:user:${user.id}`,
      limit: INVITATION_USER_LIMIT,
      windowMs: INVITATION_WINDOW_MS,
    })
    if (!userLimit.allowed) {
      return rateLimitedResponse(userLimit.retryAfterSeconds)
    }

    const adminClient = createAdminClient()
    const normalizedEmail = user.email.trim().toLowerCase()
    const now = new Date().toISOString()

    const { data: invitations, error: invitationError } = await adminClient
      .from("company_invitations")
      .select("id, company_id, role, full_name")
      .ilike("email", normalizedEmail)
      .in("status", ["pending", "accepted"])

    if (invitationError) {
      throw new Error(`Davetler okunamadı: ${invitationError.message}`)
    }

    for (const invitation of invitations ?? []) {
      const { error: membershipError } = await adminClient
        .from("company_users")
        .upsert({
          company_id: invitation.company_id,
          user_id: user.id,
          role: invitation.role,
          is_active: true,
          accepted_at: now,
        }, { onConflict: "company_id,user_id" })

      if (membershipError) {
        throw new Error(`Firma üyeliği güncellenemedi: ${membershipError.message}`)
      }

      const { error: invitationUpdateError } = await adminClient
        .from("company_invitations")
        .update({
          user_id: user.id,
          status: "accepted",
          accepted_at: now,
          last_error: null,
        })
        .eq("id", invitation.id)

      if (invitationUpdateError) {
        throw new Error(`Davet kabul edilemedi: ${invitationUpdateError.message}`)
      }
    }

    const primaryInvitation = invitations?.[0]
    const { data: existingProfile, error: profileReadError } = await adminClient
      .from("profiles")
      .select("id, full_name, role, company_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileReadError) {
      throw new Error(`Profil okunamadı: ${profileReadError.message}`)
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: user.id,
        email: normalizedEmail,
        full_name: existingProfile?.full_name || primaryInvitation?.full_name || user.user_metadata?.full_name || normalizedEmail,
        role: primaryInvitation?.role || existingProfile?.role || "company_user",
        company_id: primaryInvitation?.company_id || existingProfile?.company_id || null,
        is_active: true,
      })

    if (profileError) {
      throw new Error(`Profil güncellenemedi: ${profileError.message}`)
    }

    return NextResponse.json({
      ok: true,
      accepted_count: invitations?.length ?? 0,
    })
  } catch (error) {
    console.error("[accept-company-invitations]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Davet kabul işlemi tamamlanamadı" },
      { status: 500 }
    )
  }
}
