export function normalizeTrPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

export function normalizeUniqueTrPhones(phones: string[]): string[] {
  return Array.from(new Set(phones.map(normalizeTrPhone).filter(Boolean)))
}

export function isValidSmsRecipient(phone: string): boolean {
  return /^\d{10,15}$/.test(phone)
}
