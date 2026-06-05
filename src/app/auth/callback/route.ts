import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") || "/reset-password"

  if (!code) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const url = new URL("/reset-password", requestUrl.origin)
    url.searchParams.set("error", "invalid_link")
    return NextResponse.redirect(url)
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
