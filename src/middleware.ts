import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":")[0].toLowerCase()
  if (hostname === "www.msgnex.com") {
    const url = request.nextUrl.clone()
    url.protocol = "https:"
    url.hostname = "msgnex.com"
    url.port = ""
    return NextResponse.redirect(url, 301)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$).*)",
  ],
}
