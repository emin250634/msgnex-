import { describe, expect, it } from "vitest"
import { isValidSmsRecipient, normalizeTrPhone, normalizeUniqueTrPhones } from "./phone"

describe("TR phone normalization", () => {
  it.each([
    ["05xxxxxxxxx", "05321234567", "905321234567"],
    ["5xxxxxxxxx", "5321234567", "905321234567"],
    ["905xxxxxxxxx", "905321234567", "905321234567"],
    ["+905xxxxxxxxx", "+905321234567", "905321234567"],
    ["formatted", "+90 (532) 123-45-67", "905321234567"],
  ])("normalizes %s input", (_label, input, expected) => {
    expect(normalizeTrPhone(input)).toBe(expected)
  })

  it("keeps invalid short, long, and alphabetic inputs invalid after normalization", () => {
    expect(isValidSmsRecipient(normalizeTrPhone("532123"))).toBe(false)
    expect(isValidSmsRecipient(normalizeTrPhone("9053212345679999"))).toBe(false)
    expect(isValidSmsRecipient(normalizeTrPhone("abc"))).toBe(false)
  })

  it("deduplicates recipients after normalization", () => {
    expect(normalizeUniqueTrPhones(["05321234567", "+90 532 123 45 67", "905321234567"])).toEqual([
      "905321234567",
    ])
  })
})
