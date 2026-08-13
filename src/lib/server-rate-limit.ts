type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
  now?: number
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitEntry>()

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit({ key, limit, windowMs, now = Date.now() }: RateLimitOptions): RateLimitResult {
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: 0,
    }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    }
  }

  current.count += 1
  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - current.count, 0),
    retryAfterSeconds: 0,
  }
}

export function clearRateLimitBuckets() {
  buckets.clear()
}

export function clientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = headers.get("x-real-ip")?.trim()
  const cfIp = headers.get("cf-connecting-ip")?.trim()

  return forwardedFor || realIp || cfIp || "unknown"
}
