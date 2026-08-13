import { describe, expect, it } from "vitest"
import { daysUntilNextBirthday, formatBirthDateForMessage, isBirthdayAutomationMatch } from "./birthday"

function utcDate(value: string) {
  return new Date(`${value}T09:00:00.000Z`)
}

describe("birthday automation date matching", () => {
  it("matches a birthday on the same day", () => {
    expect(isBirthdayAutomationMatch("1990-05-12", { today: utcDate("2026-05-12") })).toBe(true)
  })

  it("matches one day before with day offset", () => {
    expect(isBirthdayAutomationMatch("1990-05-12", { today: utcDate("2026-05-11"), dayOffset: 1 })).toBe(true)
  })

  it("matches seven days before with day offset", () => {
    expect(isBirthdayAutomationMatch("1990-05-12", { today: utcDate("2026-05-05"), dayOffset: 7 })).toBe(true)
  })

  it("does not match different offsets", () => {
    expect(isBirthdayAutomationMatch("1990-05-12", { today: utcDate("2026-05-10"), dayOffset: 1 })).toBe(false)
  })

  it("calculates next birthday across year boundary", () => {
    expect(daysUntilNextBirthday("1990-01-02", utcDate("2026-12-31"))).toBe(2)
  })

  it("treats February 29 birthdays as March 1 in non-leap years", () => {
    expect(isBirthdayAutomationMatch("1992-02-29", { today: utcDate("2026-03-01") })).toBe(true)
  })

  it("keeps February 29 birthdays on February 29 in leap years", () => {
    expect(isBirthdayAutomationMatch("1992-02-29", { today: utcDate("2028-02-29") })).toBe(true)
  })

  it("returns null for missing or invalid birth dates", () => {
    expect(daysUntilNextBirthday(null, utcDate("2026-05-12"))).toBeNull()
    expect(daysUntilNextBirthday("not-a-date", utcDate("2026-05-12"))).toBeNull()
  })

  it("formats birth dates for message variables", () => {
    expect(formatBirthDateForMessage("1990-05-12")).toBe("12.05")
  })
})
