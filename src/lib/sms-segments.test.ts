import { describe, expect, it } from "vitest"
import { calculateSmsSegments, MAX_SMS_LENGTH } from "./sms-segments"

describe("calculateSmsSegments", () => {
  it("counts a short GSM-7 message as one segment", () => {
    expect(calculateSmsSegments("Hello MSGNEX")).toMatchObject({
      encoding: "GSM-7",
      units: 12,
      segments: 1,
    })
  })

  it("keeps GSM-7 160 characters in a single segment", () => {
    const result = calculateSmsSegments("a".repeat(160))

    expect(result.encoding).toBe("GSM-7")
    expect(result.units).toBe(160)
    expect(result.segments).toBe(1)
  })

  it("uses multipart GSM-7 limits after 160 units", () => {
    const result = calculateSmsSegments("a".repeat(161))

    expect(result.encoding).toBe("GSM-7")
    expect(result.units).toBe(161)
    expect(result.segments).toBe(2)
    expect(result.multipartSegmentLimit).toBe(153)
  })

  it("counts GSM-7 extension table characters as two units", () => {
    expect(calculateSmsSegments("^{}\\[~]|€")).toMatchObject({
      encoding: "GSM-7",
      units: 18,
      segments: 1,
    })
  })

  it("detects Unicode messages", () => {
    expect(calculateSmsSegments("Merhaba şğİı")).toMatchObject({
      encoding: "Unicode",
      units: 12,
      segments: 1,
    })
  })

  it("keeps Unicode 70 characters in a single segment", () => {
    const result = calculateSmsSegments("ş".repeat(70))

    expect(result.encoding).toBe("Unicode")
    expect(result.units).toBe(70)
    expect(result.segments).toBe(1)
  })

  it("uses multipart Unicode limits after 70 characters", () => {
    const result = calculateSmsSegments("ş".repeat(71))

    expect(result.encoding).toBe("Unicode")
    expect(result.units).toBe(71)
    expect(result.segments).toBe(2)
    expect(result.multipartSegmentLimit).toBe(67)
  })

  it("handles the maximum supported message length", () => {
    const result = calculateSmsSegments("a".repeat(MAX_SMS_LENGTH))

    expect(result.encoding).toBe("GSM-7")
    expect(result.units).toBe(MAX_SMS_LENGTH)
    expect(result.segments).toBe(4)
  })

  it("returns zero segments for an empty message", () => {
    expect(calculateSmsSegments("")).toMatchObject({
      encoding: "GSM-7",
      units: 0,
      segments: 0,
    })
  })
})
