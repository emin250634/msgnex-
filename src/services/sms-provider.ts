/**
 * Provider adapter used by the server-side SMS API.
 *
 * Replace FakeSmsProvider with an Infobip, Telnyx, or other wholesale adapter
 * after the provider contract is ready. Client components must never import
 * this module because provider credentials belong on the server.
 */

export interface SendSmsParams {
  recipient: string
  message: string
  senderId: string
}

export interface SendSmsResult {
  success: boolean
  messageId: string | null
  error?: string
}

export interface SmsProvider {
  sendSms(params: SendSmsParams): Promise<SendSmsResult>
  sendBulkSms(
    recipients: string[],
    message: string,
    senderId: string
  ): Promise<SendSmsResult[]>
}

class FakeSmsProvider implements SmsProvider {
  private generateMessageId(): string {
    return `FAKE-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  private async simulateNetworkDelay(): Promise<void> {
    const delay = 100 + Math.random() * 400
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    await this.simulateNetworkDelay()

    if (!/^\d{10,15}$/.test(params.recipient)) {
      return {
        success: false,
        messageId: null,
        error: `Gecersiz telefon numarasi: ${params.recipient}`,
      }
    }

    if (!params.message.trim()) {
      return {
        success: false,
        messageId: null,
        error: "Mesaj icerigi bos olamaz",
      }
    }

    if (Math.random() < 0.05) {
      return {
        success: false,
        messageId: null,
        error: "Fake provider hatasi",
      }
    }

    return {
      success: true,
      messageId: this.generateMessageId(),
    }
  }

  async sendBulkSms(
    recipients: string[],
    message: string,
    senderId: string
  ): Promise<SendSmsResult[]> {
    return Promise.all(
      recipients.map((recipient) =>
        this.sendSms({ recipient, message, senderId })
      )
    )
  }
}

export function createSmsProvider(): SmsProvider {
  return new FakeSmsProvider()
}
