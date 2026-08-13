import { isIP } from "node:net"
import { createAdminClient } from "./supabase/admin"

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitRpcClient = {
  rpc: (
    fn: "rate_limit_check",
    args: { p_key: string; p_limit: number; p_window_ms: number }
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

type RateLimitRpcRow = {
  allowed?: unknown
  limit_value?: unknown
  remaining?: unknown
  retry_after_seconds?: unknown
}

function normalizeRateLimitResult(data: unknown): RateLimitResult {
  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRpcRow | undefined

  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Invalid rate limit response")
  }

  return {
    allowed: row.allowed,
    limit: Number(row.limit_value ?? 0),
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
  }
}

export async function checkRateLimit(
  { key, limit, windowMs }: RateLimitOptions,
  rpcClient: RateLimitRpcClient = createAdminClient()
): Promise<RateLimitResult> {
  const { data, error } = await rpcClient.rpc("rate_limit_check", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  })

  if (error) {
    throw new Error(error.message)
  }

  return normalizeRateLimitResult(data)
}

function trustedProxyHeaderName() {
  return (process.env.TRUSTED_PROXY_HEADER || "x-forwarded-for").trim().toLowerCase()
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || ""
}

export function clientIpFromHeaders(headers: Headers) {
  const candidate = firstHeaderValue(headers.get(trustedProxyHeaderName()))

  return isIP(candidate) ? candidate : "unknown"
}
