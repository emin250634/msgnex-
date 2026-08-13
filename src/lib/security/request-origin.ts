import "server-only"

import { NextResponse } from "next/server"

function originFrom(value: string | null) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function configuredAppOrigin() {
  return originFrom(process.env.NEXT_PUBLIC_APP_URL ?? null)
}

export function assertSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase() ?? null
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "İstek kaynağı geçersiz." }, { status: 403 })
  }

  const origin = originFrom(request.headers.get("origin"))
  if (!origin) return null

  const allowedOrigins = new Set([new URL(request.url).origin])
  const appOrigin = configuredAppOrigin()
  if (appOrigin) allowedOrigins.add(appOrigin)

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json({ error: "İstek kaynağı geçersiz." }, { status: 403 })
  }

  return null
}
