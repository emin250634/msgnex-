export function filterSuppressedRecipients(recipients: string[], suppressedRecipients: Iterable<string>) {
  const suppressionSet = new Set(suppressedRecipients)
  const uniqueRecipients = Array.from(new Set(recipients))
  const allowed = uniqueRecipients.filter((recipient) => !suppressionSet.has(recipient))

  return {
    allowed,
    suppressed: uniqueRecipients.filter((recipient) => suppressionSet.has(recipient)),
    skippedCount: uniqueRecipients.length - allowed.length,
  }
}
