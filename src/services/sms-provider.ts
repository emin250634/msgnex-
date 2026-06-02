/**
 * Fake SMS Provider
 *
 * Replace this file with a real SMS API integration (Twilio, NetGSM, etc.)
 * The interface remains the same - just swap the implementation.
 */

interface SendSmsParams {
  recipient: string
  message: string
  senderId?: string
}

interface SendSmsResult {
  success: boolean
  messageId: string | null
  error?: string
}

function generateMessageId(): string {
  return `FAKE-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function simulateNetworkDelay(): Promise<void> {
  const delay = 100 + Math.random() * 400
  return new Promise((resolve) => setTimeout(resolve, delay))
}

function validatePhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\+\(\)]/g, "")
  return /^\d{10,15}$/.test(cleaned)
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  await simulateNetworkDelay()

  if (!validatePhoneNumber(params.recipient)) {
    return {
      success: false,
      messageId: null,
      error: `Geçersiz telefon numarası: ${params.recipient}`,
    }
  }

  if (!params.message || params.message.trim().length === 0) {
    return {
      success: false,
      messageId: null,
      error: "Mesaj içeriği boş olamaz",
    }
  }

  const shouldFail = Math.random() < 0.05

  if (shouldFail) {
    return {
      success: false,
      messageId: null,
      error: "SMS gönderilemedi: servis sağlayıcı hatası",
    }
  }

  return {
    success: true,
    messageId: generateMessageId(),
  }
}

export async function sendBulkSms(
  recipients: string[],
  message: string,
  senderId?: string
): Promise<SendSmsResult[]> {
  return Promise.all(
    recipients.map((r) => sendSms({ recipient: r, message, senderId }))
  )
}
