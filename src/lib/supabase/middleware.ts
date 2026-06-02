import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const authPages = ["/login", "/register"]

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
        setAll(cookiesToSet) {
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
  const isAdminPage = pathname.startsWith("/admin")
  const isPublicPage = pathname === "/" || pathname.startsWith("/api/")

  // Public sayfaları atla
  if (isPublicPage) return supabaseResponse

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Giriş yoksa sadece auth sayfalarına izin ver
  if (!user) {
    if (!isAuthPage) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Giriş var ama profil sorgusu başarısız olabilir
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single()

  // Profil yoksa veya pasifse auth sayfalarına izin ver, diğerlerini login'e at
  if (!profile || !profile.is_active) {
    if (!isAuthPage) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Auth sayfasındayken giriş yapılmışsa dashboard'a yönlendir
  if (isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = profile.role === "admin" ? "/admin/dashboard" : "/dashboard"
    return NextResponse.redirect(url)
  }

  // Rol bazlı route kontrolü
  if (profile.role === "admin" && !isAdminPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/dashboard"
    return NextResponse.redirect(url)
  }

  if (profile.role !== "admin" && isAdminPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
