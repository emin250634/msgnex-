import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const authPages = ["/login", "/register", "/reset-password"]

function redirectTo(request: NextRequest, pathname: string) {
  if (request.nextUrl.pathname === pathname) return null
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.redirect(url)
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const isAuthPage = authPages.includes(pathname)
  const isResetPasswordPage = pathname === "/reset-password"
  const isAdminPage = pathname.startsWith("/admin")
  const isPublicPage =
    pathname === "/" ||
    pathname === "/demo-request" ||
    pathname === "/privacy" ||
    pathname === "/kvkk" ||
    pathname === "/terms" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/callback")

  if (isPublicPage) return supabaseResponse

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (!isAuthPage) {
      return redirectTo(request, "/login") || supabaseResponse
    }
    return supabaseResponse
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    if (pathname === "/dashboard") {
      return supabaseResponse
    }
    if (!isAuthPage) {
      return redirectTo(request, "/login") || supabaseResponse
    }
    return supabaseResponse
  }

  const isAdmin = profile.role === "admin"
  if (isResetPasswordPage) {
    return supabaseResponse
  }

  if (isAuthPage) {
    if (isAdmin) {
      return redirectTo(request, "/admin/dashboard") || supabaseResponse
    }
    return supabaseResponse
  }

  if (isAdmin && !isAdminPage) {
    return redirectTo(request, "/admin/dashboard") || supabaseResponse
  }

  if (!isAdmin && isAdminPage) {
    return redirectTo(request, "/dashboard") || supabaseResponse
  }

  return supabaseResponse
}
