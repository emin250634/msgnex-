import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"

const sql = readFileSync("supabase/migrations/00048_api_dispatch_recovery.sql", "utf8")

describe("API dispatch recovery migration invariants", () => {
  it("supports review_required state for API requests", () => {
    expect(sql).toContain("CHECK (status IN ('processing', 'completed', 'review_required'))")
  })

  it("marks stale API dispatches for manual review instead of failure", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.flag_stale_api_sms_dispatches")
    expect(sql).toContain("SET status = 'review_required'")
    expect(sql).toContain("Provider delivery state is unknown and requires manual review.")
    expect(sql).not.toMatch(/SET\s+status\s*=\s*'failed'[\s\S]*flag_stale_api_sms_dispatches/i)
  })

  it("does not implement automatic resend or refund in stale recovery", () => {
    const staleFunction = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.flag_stale_api_sms_dispatches"))

    expect(staleFunction).not.toMatch(/claim_queued_sms_campaign|sendBulkSms|queue_sms_campaign|complete_queued_sms_campaign/i)
    expect(staleFunction).not.toMatch(/UPDATE\s+public\.customer_api_keys|INSERT\s+INTO\s+public\.sms_messages/i)
    expect(staleFunction).toContain("'api.dispatch_review_required'")
  })

  it("keeps completed requests out of stale recovery", () => {
    expect(sql).toContain("WHERE request.status = 'processing'")
    expect(sql).toContain("AND campaign.status = 'sending'")
  })
})
