import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createSmsProvider } from "@/services/sms-provider"
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

  let provider: SmsProvider
  try {
    provider = createSmsProvider()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Provider ayarları eksik" },
      { status: 503 }
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

    let providerResults: SendSmsResult[]
    try {
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
