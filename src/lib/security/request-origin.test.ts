import { afterEach, describe, expect, it } from "vitest"
import { assertSameOriginRequest } from "./request-origin"

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

function request(headers: Record<string, string> = {}) {
  return new Request("https://msgnex.com/api/demo-requests", {
    method: "POST",
    headers,
  })
}

describe("request origin guard", () => {
  it("allows same-origin requests", () => {
    expect(assertSameOriginRequest(request({ origin: "https://msgnex.com" }))).toBeNull()
  })

  it("allows configured app origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.msgnex.com"

    expect(assertSameOriginRequest(request({ origin: "https://app.msgnex.com" }))).toBeNull()
  })

  it("blocks cross-site fetch metadata", async () => {
    const response = assertSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({ error: "İstek kaynağı geçersiz." })
  })

  it("blocks mismatched origin headers", async () => {
    const response = assertSameOriginRequest(request({ origin: "https://attacker.example" }))

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({ error: "İstek kaynağı geçersiz." })
  })

  it("allows requests without browser origin headers for compatibility", () => {
    expect(assertSameOriginRequest(request())).toBeNull()
  })
})
