export interface BirthdayMatchOptions {
  today: Date
  dayOffset?: number
}

export function formatBirthDateForMessage(birthDate: string | null | undefined) {
  if (!birthDate) return ""
  const parsed = parseDateParts(birthDate)
  if (!parsed) return ""

  return `${String(parsed.day).padStart(2, "0")}.${String(parsed.month).padStart(2, "0")}`
}

export function daysUntilNextBirthday(birthDate: string | null | undefined, today: Date) {
  const parsed = parseDateParts(birthDate)
  if (!parsed) return null

  const current = dateOnlyUtc(today)
  const target = nextBirthdayUtc(parsed.month, parsed.day, current.getUTCFullYear())

  if (target.getTime() < current.getTime()) {
    target.setUTCFullYear(target.getUTCFullYear() + 1)
  }

  return Math.round((target.getTime() - current.getTime()) / 86400000)
}

export function isBirthdayAutomationMatch(birthDate: string | null | undefined, options: BirthdayMatchOptions) {
  const days = daysUntilNextBirthday(birthDate, options.today)
  if (days === null) return false

  return days === (options.dayOffset ?? 0)
}

function parseDateParts(value: string | null | undefined) {
  if (!value) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null

  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return { month, day }
}

function dateOnlyUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function nextBirthdayUtc(month: number, day: number, year: number) {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return new Date(Date.UTC(year, 2, 1))
  }

  return new Date(Date.UTC(year, month - 1, day))
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}
