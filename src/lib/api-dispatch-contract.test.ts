import { describe, expect, it } from "vitest"
import { existingDispatchDecision, rateLimitDecision } from "./api-dispatch-contract"

describe("API dispatch idempotency and rate-limit contract", () => {
  it("returns rate-limit response without provider dispatch", () => {
    expect(rateLimitDecision({
      rate_limited: true,
      retry_after_seconds: 120,
      message: "API rate limit exceeded: minute limit reached",
    })).toEqual({
      shouldSendProvider: false,
      status: 429,
      headers: { "Retry-After": "120" },
      body: {
        error: "API rate limit exceeded: minute limit reached",
        retryAfterSeconds: 120,
      },
    })
  })

  it("defaults Retry-After to 60 seconds", () => {
    expect(rateLimitDecision({ rate_limited: true })?.headers).toEqual({ "Retry-After": "60" })
  })

  it("reuses completed idempotency responses", () => {
    expect(existingDispatchDecision({
      created: false,
      status: "completed",
      response: { campaignId: "campaign-1", success: 2 },
    })).toMatchObject({
      shouldSendProvider: false,
      status: 200,
      body: { campaignId: "campaign-1", success: 2, reused: true },
    })
  })

  it("blocks review_required idempotency replay without resend", () => {
    expect(existingDispatchDecision({
      created: false,
      status: "review_required",
      response: { campaignId: "campaign-1" },
    })).toMatchObject({
      shouldSendProvider: false,
      status: 409,
      body: {
        errorCode: "DISPATCH_REVIEW_REQUIRED",
        campaignId: "campaign-1",
      },
    })
  })

  it("treats processing and unknown states as fail-safe in progress responses", () => {
    expect(existingDispatchDecision({ created: false, status: "processing" })).toMatchObject({
      shouldSendProvider: false,
      status: 409,
    })
    expect(existingDispatchDecision({ created: false, status: "unexpected" })).toMatchObject({
      shouldSendProvider: false,
      status: 409,
    })
  })

  it("allows provider dispatch only for newly created requests", () => {
    expect(existingDispatchDecision({ created: true })).toBeNull()
    expect(rateLimitDecision({ rate_limited: false })).toBeNull()
  })
})
