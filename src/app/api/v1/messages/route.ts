import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { MAX_SMS_LENGTH } from "@/lib/sms-segments"
import { isValidSmsRecipient, normalizeUniqueTrPhones } from "@/lib/phone"

const requestSchema = z.object({
  recipients: z.array(z.string()).min(1).max(1000),
  message: z.string().trim().min(1).max(MAX_SMS_LENGTH),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Alıcılar veya mesaj formatı geçersiz" }, { status: 400 })
  }

  const recipients = normalizeUniqueTrPhones(parsed.data.recipients)
  if (recipients.length === 0 || recipients.some((recipient) => !isValidSmsRecipient(recipient))) {
    return NextResponse.json({ error: "Geçerli bir telefon numarası girin" }, { status: 400 })
  }

  const { data: campaign, error } = await supabase.rpc("queue_sms_campaign", {
    p_message: parsed.data.message,
    p_recipients: recipients,
  })

  if (error || !campaign) {
    return NextResponse.json({ error: error?.message || "Kampanya kuyruğa alınamadı" }, { status: 400 })
  }

  return NextResponse.json({
    campaignId: campaign.campaign_id,
    status: "queued",
    estimatedProviderUnits: campaign.estimated_provider_units ?? campaign.reserved_credits,
    skippedRecipients: campaign.skipped_recipients,
  })
}
