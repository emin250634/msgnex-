import { describe, expect, it } from "vitest"
import { createProviderFailureResults, mapProviderResultsToDispatchResults } from "./provider-result"

describe("provider result normalization", () => {
  it("maps successful accepted provider results to DB payload fields", () => {
    const [result] = mapProviderResultsToDispatchResults(
      [{ id: "message-1" }],
      [{
        success: true,
        accepted: true,
        messageId: "provider-message-1",
        providerName: "netgsm",
        providerBulkId: "bulk-1",
        providerStatusCode: "00",
        providerStatusText: "Accepted",
        rawStatus: { code: "00" },
      }]
    )

    expect(result).toEqual({
      id: "message-1",
      success: true,
      accepted: true,
      provider_name: "netgsm",
      provider_bulk_id: "bulk-1",
      provider_message_id: "provider-message-1",
      provider_status_code: "00",
      provider_status_text: "Accepted",
      error: null,
      raw_status: { code: "00" },
    })
  })

  it("defaults accepted to success and preserves failed provider errors", () => {
    const [result] = mapProviderResultsToDispatchResults(
      [{ id: "message-1" }],
      [{
        success: false,
        messageId: null,
        error: "Provider rejected",
        providerName: "netgsm",
        providerStatusCode: "30",
        providerStatusText: "Invalid credentials",
      }]
    )

    expect(result.accepted).toBe(false)
    expect(result.error).toBe("Provider rejected")
    expect(result.provider_status_code).toBe("30")
  })

  it("handles missing optional provider fields", () => {
    const [result] = mapProviderResultsToDispatchResults([{ id: "message-1" }], [{ success: true, messageId: "m1" }])

    expect(result.provider_name).toBeNull()
    expect(result.provider_bulk_id).toBeNull()
    expect(result.provider_status_text).toBeNull()
    expect(result.raw_status).toBeNull()
  })

  it("fails closed when provider returns fewer results than messages", () => {
    const results = mapProviderResultsToDispatchResults([{ id: "message-1" }, { id: "message-2" }], [])

    expect(results).toEqual([
      expect.objectContaining({ id: "message-1", success: false, error: "Provider sonucu eksik" }),
      expect.objectContaining({ id: "message-2", success: false, error: "Provider sonucu eksik" }),
    ])
  })

  it("creates deterministic provider failure placeholders", () => {
    expect(createProviderFailureResults(2, "Provider request failed")).toEqual([
      { success: false, messageId: null, error: "Provider request failed" },
      { success: false, messageId: null, error: "Provider request failed" },
    ])
  })
})
