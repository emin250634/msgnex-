/**
 * Provider adapter used by the server-side SMS API.
 *
 * Replace FakeSmsProvider with an Infobip, Telnyx, or other wholesale adapter
 * after the provider contract is ready. Client components must never import
 * this module because provider credentials belong on the server.
 */

import { getProviderErrorInfo } from "../lib/provider-errors"
import { assertTestProviderAllowed } from "./test-provider-guard"

export interface SendSmsParams {
  recipient: string
  message: string
  senderId: string
}

export interface SendSmsResult {
  success: boolean
  messageId: string | null
  error?: string
  accepted?: boolean
  providerName?: string
  providerBulkId?: string | null
  providerStatusCode?: string | null
  providerStatusText?: string | null
  rawStatus?: unknown
}

export interface ProviderConnectionResult {
  ok: boolean
  statusCode: string
  message: string
  rawResponse?: unknown
}

export interface ProviderSenderHeadersResult {
  ok: boolean
  headers: string[]
  statusCode: string
  message: string
  rawResponse?: unknown
}

export interface ProviderCreditStatusResult {
  ok: boolean
  amount: number | null
  unit: string
  currency: string
  statusCode: string
  message: string
  rawResponse?: unknown
}

export interface SmsProvider {
  sendSms(params: SendSmsParams): Promise<SendSmsResult>
  sendBulkSms(
    recipients: string[],
    message: string,
    senderId: string
  ): Promise<SendSmsResult[]>
  testConnection?(): Promise<ProviderConnectionResult>
  getSenderHeaders?(): Promise<ProviderSenderHeadersResult>
  getCreditStatus?(): Promise<ProviderCreditStatusResult>
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
  async testConnection(): Promise<ProviderConnectionResult> {
    return {
      ok: true,
      statusCode: "TEST_OK",
      message: "Test provider bağlantısı hazır",
      rawResponse: { provider: "test" },
    }
  }

  async getSenderHeaders(): Promise<ProviderSenderHeadersResult> {
    return {
      ok: true,
      headers: ["MSGNEX"],
      statusCode: "TEST_OK",
      message: "Test provider başlığı hazır",
      rawResponse: { msgheaders: ["MSGNEX"] },
    }
  }

  async getCreditStatus(): Promise<ProviderCreditStatusResult> {
    return {
      ok: true,
      amount: 999999,
      unit: "sms",
      currency: "TRY",
      statusCode: "TEST_OK",
      message: "Test provider kredi durumu hazır",
      rawResponse: { balance: [{ amount: 999999, balance_name: "Test SMS" }] },
    }
  }
}

export interface NetgsmProviderConfig {
  endpoint?: string | null
  userCode: string
  password: string
  defaultHeader?: string | null
  appKey?: string | null
  encoding?: string | null
  timeoutMs?: number | null
}

class NetgsmProvider implements SmsProvider {
  private readonly endpoint: string
  private readonly userCode: string
  private readonly password: string
  private readonly defaultHeader: string | null
  private readonly appKey: string | null
  private readonly encoding: string
  private readonly timeoutMs: number
  private readonly balanceEndpoint: string
  private readonly senderHeadersEndpoint: string

  constructor(config?: NetgsmProviderConfig) {
    this.endpoint =
      config?.endpoint ||
      process.env.NETGSM_ENDPOINT ||
      "https://api.netgsm.com.tr/sms/send/xml"
    this.balanceEndpoint =
      process.env.NETGSM_BALANCE_ENDPOINT ||
      "https://api.netgsm.com.tr/balance"
    this.senderHeadersEndpoint =
      process.env.NETGSM_HEADERS_ENDPOINT ||
      "https://api.netgsm.com.tr/sms/rest/v2/msgheader"
    this.userCode = config?.userCode || process.env.NETGSM_USERCODE || ""
    this.password = config?.password || process.env.NETGSM_PASSWORD || ""
    this.defaultHeader = config?.defaultHeader ?? process.env.NETGSM_HEADER ?? null
    this.appKey = config?.appKey ?? process.env.NETGSM_APPKEY ?? null
    this.encoding = config?.encoding || process.env.NETGSM_ENCODING || "TR"
    this.timeoutMs = Number(config?.timeoutMs || process.env.SMS_PROVIDER_TIMEOUT_MS || 15000)

    if (!this.userCode || !this.password) {
      throw new Error("NETGSM_USERCODE ve NETGSM_PASSWORD tanimli degil")
    }
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    const [result] = await this.sendBulkSms(
      [params.recipient],
      params.message,
      params.senderId
    )
    return result
  }

  async sendBulkSms(
    recipients: string[],
    message: string,
    senderId: string
  ): Promise<SendSmsResult[]> {
    const normalizedRecipients = recipients.map((recipient) =>
      this.normalizeRecipient(recipient)
    )
    const invalidRecipient = normalizedRecipients.find(
      (recipient) => !/^5\d{9}$/.test(recipient)
    )

    if (invalidRecipient) {
      return recipients.map((recipient) => ({
        success: false,
        accepted: false,
        messageId: null,
        providerName: "netgsm",
        providerBulkId: null,
        providerStatusCode: "INVALID_RECIPIENT",
        providerStatusText: "Gecersiz Netgsm alici formati",
        error: `Gecersiz telefon numarasi: ${recipient}`,
      }))
    }

    if (!message.trim()) {
      return recipients.map(() => ({
        success: false,
        accepted: false,
        messageId: null,
        providerName: "netgsm",
        providerBulkId: null,
        providerStatusCode: "INVALID_MESSAGE",
        providerStatusText: "Mesaj icerigi bos olamaz",
        error: "Mesaj icerigi bos olamaz",
      }))
    }

    const sender = (senderId || this.defaultHeader || "").trim()
    if (sender.length < 3 || sender.length > 11) {
      return recipients.map(() => ({
        success: false,
        accepted: false,
        messageId: null,
        providerName: "netgsm",
        providerBulkId: null,
        providerStatusCode: "INVALID_SENDER",
        providerStatusText: "Netgsm basligi 3-11 karakter olmalidir",
        error: "Netgsm basligi 3-11 karakter olmalidir",
      }))
    }

    const payload = this.buildXmlPayload(normalizedRecipients, message, sender)
    let rawResponse = ""

    try {
      rawResponse = await this.postXml(payload)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Netgsm istegi tamamlanamadi"
      return recipients.map(() => ({
        success: false,
        accepted: false,
        messageId: null,
        providerName: "netgsm",
        providerBulkId: null,
        providerStatusCode: "PROVIDER_REQUEST_FAILED",
        providerStatusText: message,
        error: message,
      }))
    }

    const parsed = this.parseResponse(rawResponse)
    if (!parsed.success) {
      return recipients.map(() => ({
        success: false,
        accepted: false,
        messageId: null,
        providerName: "netgsm",
        providerBulkId: parsed.bulkId,
        providerStatusCode: parsed.code,
        providerStatusText: parsed.message,
        error: parsed.message,
        rawStatus: rawResponse,
      }))
    }

    return recipients.map((recipient, index) => ({
      success: true,
      accepted: true,
      messageId: `${parsed.bulkId}:${index}`,
      providerName: "netgsm",
      providerBulkId: parsed.bulkId,
      providerStatusCode: parsed.code,
      providerStatusText: parsed.message,
      rawStatus: rawResponse,
    }))
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const headers = await this.getSenderHeaders()
    return {
      ok: headers.ok,
      statusCode: headers.statusCode,
      message: headers.ok ? "Netgsm bağlantısı doğrulandı" : headers.message,
      rawResponse: headers.rawResponse,
    }
  }

  async getSenderHeaders(): Promise<ProviderSenderHeadersResult> {
    try {
      const rawResponse = await this.getJsonWithBasicAuth(this.senderHeadersEndpoint)
      const code = String(rawResponse?.code ?? "UNKNOWN")
      const headers = Array.isArray(rawResponse?.msgheaders)
        ? rawResponse.msgheaders.map((header: unknown) => String(header).trim()).filter(Boolean)
        : []
      const ok = code === "00"

      return {
        ok,
        headers,
        statusCode: code,
        message: ok ? "Netgsm gönderici başlıkları sorgulandı" : this.errorMessage(code, JSON.stringify(rawResponse)),
        rawResponse,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Netgsm başlık sorgusu tamamlanamadı"
      return {
        ok: false,
        headers: [],
        statusCode: "PROVIDER_REQUEST_FAILED",
        message,
      }
    }
  }

  async getCreditStatus(): Promise<ProviderCreditStatusResult> {
    try {
      const rawResponse = await this.postJson(this.balanceEndpoint, {
        usercode: this.userCode,
        password: this.password,
        stip: 1,
      })
      return {
        ...this.parseBalanceResponse(rawResponse),
        rawResponse,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Netgsm kredi sorgusu tamamlanamadı"
      return {
        ok: false,
        amount: null,
        unit: "sms",
        currency: "TRY",
        statusCode: "PROVIDER_REQUEST_FAILED",
        message,
      }
    }
  }

  private normalizeRecipient(recipient: string): string {
    const digits = recipient.replace(/\D/g, "")
    if (digits.length === 12 && digits.startsWith("90")) return digits.slice(2)
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
    return digits
  }

  private buildXmlPayload(
    recipients: string[],
    message: string,
    senderId: string
  ): string {
    const numbers = recipients.map((recipient) => `<no>${recipient}</no>`).join("")
    const appKey = this.appKey ? `<appkey>${this.escapeXml(this.appKey)}</appkey>` : ""

    return `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
  <header>
    <company dil="${this.escapeXml(this.encoding)}">Netgsm</company>
    <usercode>${this.escapeXml(this.userCode)}</usercode>
    <password>${this.escapeXml(this.password)}</password>
    ${appKey}
    <type>1:n</type>
    <msgheader>${this.escapeXml(senderId)}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${this.escapeCdata(message)}]]></msg>
    ${numbers}
  </body>
</mainbody>`
  }

  private async postXml(payload: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
        body: payload,
        signal: controller.signal,
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Netgsm HTTP ${response.status}: ${text || response.statusText}`)
      }

      return text
    } finally {
      clearTimeout(timeout)
    }
  }

  private async getJsonWithBasicAuth(endpoint: string): Promise<any> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const token = Buffer.from(`${this.userCode}:${this.password}`).toString("base64")
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Basic ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Netgsm HTTP ${response.status}: ${text || response.statusText}`)
      }

      return JSON.parse(text)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async postJson(endpoint: string, payload: Record<string, unknown>): Promise<any> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Netgsm HTTP ${response.status}: ${text || response.statusText}`)
      }

      return JSON.parse(text)
    } finally {
      clearTimeout(timeout)
    }
  }

  private parseBalanceResponse(rawResponse: any): ProviderCreditStatusResult {
    const code = rawResponse?.code ? String(rawResponse.code) : "00"
    if (code !== "00") {
      return {
        ok: false,
        amount: null,
        unit: "sms",
        currency: "TRY",
        statusCode: code,
        message: this.errorMessage(code, JSON.stringify(rawResponse)),
      }
    }

    if (Array.isArray(rawResponse?.balance)) {
      const firstSmsBalance =
        rawResponse.balance.find((item: any) => String(item?.balance_name || "").toLowerCase().includes("sms")) ||
        rawResponse.balance[0]
      const amount = Number(firstSmsBalance?.amount)

      return {
        ok: Number.isFinite(amount),
        amount: Number.isFinite(amount) ? amount : null,
        unit: firstSmsBalance?.balance_name ? String(firstSmsBalance.balance_name) : "sms",
        currency: "TRY",
        statusCode: "00",
        message: "Netgsm kredi durumu sorgulandı",
      }
    }

    const amount = Number(rawResponse?.balance)
    return {
      ok: Number.isFinite(amount),
      amount: Number.isFinite(amount) ? amount : null,
      unit: "kredi",
      currency: "TRY",
      statusCode: "00",
      message: "Netgsm kredi durumu sorgulandı",
    }
  }

  private parseResponse(rawResponse: string): {
    success: boolean
    code: string
    bulkId: string | null
    message: string
  } {
    const trimmed = rawResponse.trim()
    const code =
      this.matchXmlValue(trimmed, "code") ||
      trimmed.match(/^(\d{2,3})(?:\s+|$)/)?.[1] ||
      "UNKNOWN"
    const bulkId =
      this.matchXmlValue(trimmed, "jobID") ||
      this.matchXmlValue(trimmed, "jobid") ||
      this.matchXmlValue(trimmed, "bulkID") ||
      this.matchXmlValue(trimmed, "bulkid") ||
      trimmed.match(/^(?:00|0)\s+([A-Za-z0-9_-]+)/)?.[1] ||
      null

    const success = (code === "00" || code === "0") && Boolean(bulkId)
    return {
      success,
      code,
      bulkId,
      message: success ? "Netgsm tarafindan kabul edildi" : this.errorMessage(code, trimmed),
    }
  }

  private matchXmlValue(value: string, tagName: string): string | null {
    const match = value.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, "i"))
    return match?.[1]?.trim() || null
  }

  private errorMessage(code: string, rawResponse: string): string {
    const info = getProviderErrorInfo("netgsm", code)
    return info ? info.title : `Netgsm hatasi (${code}): ${rawResponse}`
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  private escapeCdata(value: string): string {
    return value.replace(/\]\]>/g, "]]]]><![CDATA[>")
  }

}

export function createSmsProvider(): SmsProvider {
  const configuredProvider = process.env.SMS_PROVIDER?.trim().toLowerCase()
  if (!configuredProvider && process.env.NODE_ENV === "production") {
    throw new Error("Production ortamında SMS_PROVIDER zorunludur")
  }

  const provider = configuredProvider || "fake"
  if (provider === "netgsm") return new NetgsmProvider()
  if (provider === "fake") return createTestSmsProvider()
  throw new Error(`Desteklenmeyen SMS provider: ${provider}`)
}

export function createNetgsmProvider(config: NetgsmProviderConfig): SmsProvider {
  return new NetgsmProvider(config)
}

export function createTestSmsProvider(): SmsProvider {
  assertTestProviderAllowed()
  return new FakeSmsProvider()
}
