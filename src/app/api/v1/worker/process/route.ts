import { NextResponse } from "next/server"
import { z } from "zod"
import { hasValidWorkerAuthorization } from "@/lib/security/worker-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendCampaignWithCompanyProvider } from "@/services/company-sms-provider"

const requestSchema = z.object({
  maxCampaigns: z.number().int().min(1).max(20).default(5),
  staleTimeoutMinutes: z.number().int().min(5).max(1440).default(15),
})

export async function POST(request: Request) {
  if (!hasValidWorkerAuthorization(request)) {
    return NextResponse.json({ error: "Worker yetkisi gerekli" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Worker istegi gecersiz" }, { status: 400 })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    console.error("[worker-process:init]", { error })
    return NextResponse.json(
      { error: "Worker ayarlari eksik" },
      { status: 500 }
    )
  }

  const processed: unknown[] = []
  const { data: flaggedCount, error: staleError } = await supabase.rpc(
    "flag_stale_sending_campaigns",
    { p_timeout_minutes: parsed.data.staleTimeoutMinutes }
  )
  if (staleError) {
    console.error("[worker-process:flag-stale-campaigns]", { error: staleError })
    return NextResponse.json({ error: "Worker islemi tamamlanamadi" }, { status: 500 })
  }

  const { data: flaggedApiDispatchCount, error: staleApiError } = await supabase.rpc(
    "flag_stale_api_sms_dispatches",
    { p_timeout_minutes: parsed.data.staleTimeoutMinutes }
  )
  if (staleApiError) {
    console.error("[worker-process:flag-stale-api-dispatches]", { error: staleApiError })
    return NextResponse.json({ error: "Worker islemi tamamlanamadi" }, { status: 500 })
  }

  for (let index = 0; index < parsed.data.maxCampaigns; index += 1) {
    const { data: campaign, error: claimError } = await supabase.rpc("claim_queued_sms_campaign")
    if (claimError) {
      console.error("[worker-process:claim-campaign]", { error: claimError })
      return NextResponse.json({ error: "Worker islemi tamamlanamadi" }, { status: 500 })
    }
    if (!campaign) break

    const results = await sendCampaignWithCompanyProvider(supabase, {
      companyId: campaign.company_id,
      messages: campaign.messages,
      message: campaign.message,
      senderId: campaign.sender_id,
      failureMessage: "Provider istegi tamamlanamadi",
    })

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_queued_sms_campaign",
      { p_campaign_id: campaign.campaign_id, p_results: results }
    )

    if (completionError) {
      console.error("[worker-process:complete-campaign]", { campaignId: campaign.campaign_id, error: completionError })
      return NextResponse.json({ error: "Worker islemi tamamlanamadi" }, { status: 500 })
    }
    processed.push(completed)
  }

  return NextResponse.json({
    processedCount: processed.length,
    flaggedForReviewCount: flaggedCount ?? 0,
    flaggedApiDispatchForReviewCount: flaggedApiDispatchCount ?? 0,
    campaigns: processed,
  })
}
