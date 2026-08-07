import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { MAX_SMS_LENGTH } from "@/lib/sms-segments"

const requestSchema = z.object({
  recipients: z.array(z.string()).min(1).max(1000),
  message: z.string().trim().min(1).max(MAX_SMS_LENGTH),
})

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Alıcılar veya mesaj formatı geçersiz" }, { status: 400 })
  }

  const recipients = Array.from(new Set(parsed.data.recipients.map(normalizePhone).filter(Boolean)))
  if (recipients.length === 0 || recipients.some((recipient) => !/^\d{10,15}$/.test(recipient))) {
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
