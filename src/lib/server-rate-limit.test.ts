import { beforeEach, describe, expect, it } from "vitest"
import { checkRateLimit, clearRateLimitBuckets, clientIpFromHeaders } from "./server-rate-limit"

describe("server rate limit", () => {
  beforeEach(() => {
    clearRateLimitBuckets()
  })

  it("allows requests until the limit is reached", () => {
    expect(checkRateLimit({ key: "demo:1", limit: 2, windowMs: 60_000, now: 1_000 })).toMatchObject({
      allowed: true,
      remaining: 1,
    })
    expect(checkRateLimit({ key: "demo:1", limit: 2, windowMs: 60_000, now: 2_000 })).toMatchObject({
      allowed: true,
      remaining: 0,
    })
    expect(checkRateLimit({ key: "demo:1", limit: 2, windowMs: 60_000, now: 3_000 })).toMatchObject({
      allowed: false,
      retryAfterSeconds: 58,
    })
  })

  it("resets the bucket after the window", () => {
    expect(checkRateLimit({ key: "demo:2", limit: 1, windowMs: 1_000, now: 1_000 }).allowed).toBe(true)
    expect(checkRateLimit({ key: "demo:2", limit: 1, windowMs: 1_000, now: 1_500 }).allowed).toBe(false)
    expect(checkRateLimit({ key: "demo:2", limit: 1, windowMs: 1_000, now: 2_001 }).allowed).toBe(true)
  })

  it("extracts the first forwarded client ip", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "198.51.100.7",
    })

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10")
  })
})
