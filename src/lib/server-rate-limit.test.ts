import { afterEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit, clientIpFromHeaders } from "./server-rate-limit"

describe("server rate limit", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("maps allowed RPC responses", async () => {
    const rpcClient = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ allowed: true, limit_value: 2, remaining: 1, retry_after_seconds: 0 }],
        error: null,
      }),
    }

    await expect(checkRateLimit({ key: "demo:1", limit: 2, windowMs: 60_000 }, rpcClient)).resolves.toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 0,
    })

    expect(rpcClient.rpc).toHaveBeenCalledWith("rate_limit_check", {
      p_key: "demo:1",
      p_limit: 2,
      p_window_ms: 60_000,
    })
  })

  it("maps blocked RPC responses", async () => {
    const rpcClient = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ allowed: false, limit_value: 2, remaining: 0, retry_after_seconds: 58 }],
        error: null,
      }),
    }

    await expect(checkRateLimit({ key: "demo:2", limit: 2, windowMs: 60_000 }, rpcClient)).resolves.toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 58,
    })
  })

  it("fails closed on RPC errors", async () => {
    const rpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } }),
    }

    await expect(checkRateLimit({ key: "demo:3", limit: 1, windowMs: 1_000 }, rpcClient)).rejects.toThrow(
      "database unavailable"
    )
  })

  it("extracts the first trusted forwarded client ip", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "198.51.100.7",
    })

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10")
  })

  it("returns unknown for invalid trusted proxy headers", () => {
    const headers = new Headers({ "x-forwarded-for": "not-an-ip" })

    expect(clientIpFromHeaders(headers)).toBe("unknown")
  })

  it("uses TRUSTED_PROXY_HEADER when configured", () => {
    vi.stubEnv("TRUSTED_PROXY_HEADER", "x-real-ip")
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10",
      "x-real-ip": "198.51.100.7",
    })

    expect(clientIpFromHeaders(headers)).toBe("198.51.100.7")
  })
})
