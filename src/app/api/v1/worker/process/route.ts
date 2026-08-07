import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptProviderSecret } from "@/lib/security/provider-secret"
import { createNetgsmProvider, createTestSmsProvider } from "@/services/sms-provider"
import type { SendSmsResult, SmsProvider } from "@/services/sms-provider"

const requestSchema = z.object({
  maxCampaigns: z.number().int().min(1).max(20).default(5),
  staleTimeoutMinutes: z.number().int().min(5).max(1440).default(15),
})

function isAuthorized(request: Request): boolean {
  const workerSecret = process.env.WORKER_SECRET
  const authorization = request.headers.get("authorization")
  return Boolean(workerSecret && authorization === `Bearer ${workerSecret}`)
}

async function createProviderForCompany(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string
): Promise<SmsProvider> {
  const { data: setting, error } = await supabase
    .from("company_provider_settings")
    .select("provider_name, is_active, usercode, encrypted_secret, sender_header, timeout_ms, encoding")
    .eq("company_id", companyId)
    .eq("provider_name", "netgsm")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!setting || !setting.is_active || !setting.usercode || !setting.encrypted_secret || !setting.sender_header) {
    throw new Error("Firma Netgsm provider bağlantısı aktif değil")
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Worker yetkisi gerekli" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Worker isteği geçersiz" }, { status: 400 })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Worker ayarları eksik" },
      { status: 500 }
    )
  }

  const processed: unknown[] = []
  const { data: flaggedCount, error: staleError } = await supabase.rpc(
    "flag_stale_sending_campaigns",
    { p_timeout_minutes: parsed.data.staleTimeoutMinutes }
  )
  if (staleError) return NextResponse.json({ error: staleError.message }, { status: 500 })

  for (let index = 0; index < parsed.data.maxCampaigns; index += 1) {
    const { data: campaign, error: claimError } = await supabase.rpc("claim_queued_sms_campaign")
    if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
    if (!campaign) break

    let provider: SmsProvider
    let providerResults: SendSmsResult[]
    try {
      provider = await createProviderForCompany(supabase, campaign.company_id)
      providerResults = await provider.sendBulkSms(
        campaign.messages.map((message: { recipient: string }) => message.recipient),
        campaign.message,
        campaign.sender_id
      )
    } catch {
      providerResults = campaign.messages.map(() => ({
        success: false,
        messageId: null,
        error: "Provider isteği tamamlanamadı",
      }))
    }

    const results = providerResults.map((result, resultIndex) => ({
      id: campaign.messages[resultIndex].id,
      success: result.success,
      accepted: result.accepted ?? result.success,
      provider_name: result.providerName ?? null,
      provider_bulk_id: result.providerBulkId ?? null,
      provider_message_id: result.messageId,
      provider_status_code: result.providerStatusCode ?? null,
      provider_status_text: result.providerStatusText ?? null,
      error: result.error ?? null,
      raw_status: result.rawStatus ?? null,
    }))

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_queued_sms_campaign",
      { p_campaign_id: campaign.campaign_id, p_results: results }
    )

    if (completionError) return NextResponse.json({ error: completionError.message }, { status: 500 })
    processed.push(completed)
  }

  return NextResponse.json({
    processedCount: processed.length,
    flaggedForReviewCount: flaggedCount ?? 0,
    campaigns: processed,
  })
}
