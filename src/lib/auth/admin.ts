import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface AdminAuthResult {
  userId: string
  profile: {
    id: string
    role: string
    is_active: boolean
  }
  adminClient: ReturnType<typeof createAdminClient>
}

export async function requireAdminAuth(): Promise<
  | { ok: true; context: AdminAuthResult }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    }
  }

  const adminClient = createAdminClient()
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !profile || profile.role !== "admin" || profile.is_active !== true) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin authorization required" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      profile,
      adminClient,
    },
  }
}
