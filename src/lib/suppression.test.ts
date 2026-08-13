import { describe, expect, it } from "vitest"
import { filterSuppressedRecipients } from "./suppression"

describe("suppression filtering", () => {
  it("removes suppressed recipients and keeps non-suppressed recipients", () => {
    expect(filterSuppressedRecipients(["905321111111", "905322222222"], ["905321111111"])).toEqual({
      allowed: ["905322222222"],
      suppressed: ["905321111111"],
      skippedCount: 1,
    })
  })

  it("handles all recipients suppressed", () => {
    expect(filterSuppressedRecipients(["905321111111"], ["905321111111"])).toEqual({
      allowed: [],
      suppressed: ["905321111111"],
      skippedCount: 1,
    })
  })

  it("deduplicates recipients before suppression comparison", () => {
    expect(filterSuppressedRecipients(["905321111111", "905321111111", "905322222222"], ["905321111111"])).toEqual({
      allowed: ["905322222222"],
      suppressed: ["905321111111"],
      skippedCount: 1,
    })
  })
})
