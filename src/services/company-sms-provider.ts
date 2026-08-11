import "server-only"

import { decryptProviderSecret } from "../lib/security/provider-secret"
import { createNetgsmProvider, createTestSmsProvider, type SmsProvider } from "./sms-provider"
import {
  createProviderFailureResults,
  mapProviderResultsToDispatchResults,
  type ProviderDispatchResult,
  type ProviderMessage,
} from "./provider-result"
import type { SendSmsResult } from "./sms-provider"

interface ProviderSettingsRow {
  is_active: boolean
  usercode: string | null
  encrypted_secret: string | null
  sender_header: string | null
  timeout_ms: number | null
  encoding: string | null
}

interface SupabaseProviderClient {
  from(table: string): any
}

export const PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED"

export class SmsProviderConfigurationError extends Error {
  readonly code = PROVIDER_NOT_CONFIGURED

  constructor(message = "Firma SMS provider baglantisi aktif degil") {
    super(message)
    this.name = "SmsProviderConfigurationError"
  }
}

export async function createCompanySmsProvider(
  supabase: SupabaseProviderClient,
  companyId: string
): Promise<SmsProvider> {
  const { data: setting, error } = await supabase
    .from("company_provider_settings")
    .select("provider_name, is_active, usercode, encrypted_secret, sender_header, timeout_ms, encoding")
    .eq("company_id", companyId)
    .eq("provider_name", "netgsm")
    .maybeSingle() as { data: ProviderSettingsRow | null; error: { message: string } | null }

  if (error) throw new SmsProviderConfigurationError()
  if (!setting || !setting.is_active || !setting.usercode || !setting.encrypted_secret || !setting.sender_header) {
    throw new SmsProviderConfigurationError()
  }

  if (setting.encoding === "TEST") {
    return createTestSmsProvider()
  }

  return createNetgsmProvider({
    userCode: setting.usercode,
    password: decryptProviderSecret(setting.encrypted_secret),
    defaultHeader: setting.sender_header,
    timeoutMs: setting.timeout_ms,
    encoding: setting.encoding,
  })
}

export async function sendCampaignWithCompanyProvider(
  supabase: SupabaseProviderClient,
  input: {
    companyId: string
    messages: Array<ProviderMessage & { recipient: string }>
    message: string
    senderId: string
    failureMessage: string
  }
): Promise<ProviderDispatchResult[]> {
  let providerResults: SendSmsResult[]
  try {
    const provider = await createCompanySmsProvider(supabase, input.companyId)
    providerResults = await provider.sendBulkSms(
      input.messages.map((message) => message.recipient),
      input.message,
      input.senderId
    )
  } catch {
    providerResults = createProviderFailureResults(input.messages.length, input.failureMessage)
  }

  return mapProviderResultsToDispatchResults(input.messages, providerResults)
}

export { createProviderFailureResults, mapProviderResultsToDispatchResults }
