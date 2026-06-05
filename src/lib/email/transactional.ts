interface SendEmailInput {
  to: string
  subject: string
  text: string
  html: string
}
export async function sendTransactionalEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.TRANSACTIONAL_EMAIL_FROM

  if (!apiKey || !from) {
    throw new Error("Red bildirim maili için RESEND_API_KEY ve TRANSACTIONAL_EMAIL_FROM tanımlanmalıdır.")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || "Bildirim maili gönderilemedi.")
  }

  return payload?.id as string | undefined
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}
