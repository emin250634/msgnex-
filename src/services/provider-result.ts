import type { SendSmsResult } from "@/services/sms-provider"

export interface ProviderMessage {
  id: string
}

export interface ProviderDispatchResult {
  id: string
  success: boolean
  accepted: boolean
  provider_name: string | null
  provider_bulk_id: string | null
  provider_message_id: string | null
  provider_status_code: string | null
  provider_status_text: string | null
  error: string | null
  raw_status: unknown | null
}

export function mapProviderResultsToDispatchResults(
  messages: ProviderMessage[],
  providerResults: SendSmsResult[]
): ProviderDispatchResult[] {
  return messages.map((message, index) => {
    const result = providerResults[index] ?? {
      success: false,
      messageId: null,
      error: "Provider sonucu eksik",
    }

    return {
      id: message.id,
      success: result.success,
      accepted: result.accepted ?? result.success,
      provider_name: result.providerName ?? null,
      provider_bulk_id: result.providerBulkId ?? null,
      provider_message_id: result.messageId,
      provider_status_code: result.providerStatusCode ?? null,
      provider_status_text: result.providerStatusText ?? null,
      error: result.error ?? null,
      raw_status: result.rawStatus ?? null,
    }
  })
}

export function createProviderFailureResults(count: number, error: string): SendSmsResult[] {
  return Array.from({ length: count }, () => ({
    success: false,
    messageId: null,
    error,
  }))
}
