import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { escapeHtml, sendTransactionalEmail } from "@/lib/email/transactional"
import { getResetPasswordRedirectUrl } from "@/lib/utils/app-url"

const OWNER_ROLE = "company_owner"
const SIMPLE_STATUSES = ["new", "contacted"]
const PROVIDER_STATUS_LABELS: Record<string, string> = {
  yes: "Mevcut sağlayıcı var",
  no: "Sağlayıcı yok",
  planning: "Teklif aşamasında",
}

class DemoRequestSafeError extends Error {}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength)
}
function buildCompanySalesNote(demo: Record<string, any>) {
  const rows = [
    ["Demo mesajı", clean(demo.message, 1500)],
    ["Mevcut sağlayıcı durumu", PROVIDER_STATUS_LABELS[clean(demo.has_sms_provider, 40)] || ""],
    ["Paylaşılan sağlayıcı", clean(demo.sms_provider_name, 120)],
    ["Önerilen sağlayıcı", clean(demo.recommended_provider, 120)],
    ["Sonraki aksiyon", clean(demo.next_action, 500)],
    ["Takip tarihi", demo.follow_up_at ? new Date(demo.follow_up_at).toLocaleString("tr-TR") : ""],
    ["Satış notu", clean(demo.sales_note, 2000)],
  ].filter(([, value]) => value)

  return rows.map(([label, value]) => `${label}: ${value}`).join("\n")
}
async function recordError(adminClient: any, id: string, error: unknown, extra: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : "İşlem tamamlanamadı."
  await adminClient.from("demo_requests").update({ last_error: message, ...extra }).eq("id", id)
  return message
}

async function updateSalesFollowUp(auth: Awaited<ReturnType<typeof requireAdminAuth>>, body: any) {
  if (!auth.ok) return auth.response
  const id = String(body.id ?? "")
  if (!id) return errorResponse("Demo talebi zorunludur.")

  const followUpRaw = clean(body.follow_up_at, 80)
  const followUpDate = followUpRaw ? new Date(followUpRaw) : null
  if (followUpRaw && Number.isNaN(followUpDate?.getTime())) {
    return errorResponse("Takip tarihi geçersiz.")
  }

  const { data, error } = await auth.context.adminClient.from("demo_requests").update({
    sales_note: clean(body.sales_note, 2000) || null,
    recommended_provider: clean(body.recommended_provider, 120) || null,
    next_action: clean(body.next_action, 500) || null,
    follow_up_at: followUpDate ? followUpDate.toISOString() : null,
    last_error: null,
  }).eq("id", id).select("*").maybeSingle()

  if (error) {
    console.error("[admin-demo-requests:update-sales-follow-up]", { requestId: id, error })
    return errorResponse("Satış takip notu kaydedilemedi.", 500)
  }
  if (!data) return errorResponse("Demo talebi bulunamadı.", 404)
  return NextResponse.json({ request: data, message: "Satış takip notu kaydedildi." })
}

async function approveDemoRequest(request: NextRequest, auth: Awaited<ReturnType<typeof requireAdminAuth>>, id: string) {
  if (!auth.ok) return auth.response
  const { adminClient, userId } = auth.context
  const { data: demo, error: demoError } = await adminClient.from("demo_requests").select("*").eq("id", id).maybeSingle()
  if (demoError) {
    console.error("[admin-demo-requests:approve:read-demo]", { requestId: id, error: demoError })
    return errorResponse("Demo talebi okunamadı.", 500)
  }
  if (!demo) return errorResponse("Demo talebi bulunamadı.", 404)
  if (demo.status === "rejected") return errorResponse("Reddedilmiş demo talebi doğrudan onaylanamaz.")
  if (demo.status === "approved" && demo.company_id && demo.invitation_id) {
    return NextResponse.json({ request: demo, company_id: demo.company_id, message: "Bu talep daha önce onaylanmış." })
  }

  const email = String(demo.email).trim().toLowerCase()
  let companyId = demo.company_id as string | null

  try {
    if (!companyId) {
      const [{ data: sameCompany }, { data: sameProfile }] = await Promise.all([
        adminClient.from("companies").select("id, name").ilike("name", String(demo.company_name).trim()).limit(1).maybeSingle(),
        adminClient.from("profiles").select("id, email").ilike("email", email).limit(1).maybeSingle(),
      ])
      if (sameCompany) throw new DemoRequestSafeError(`"${sameCompany.name}" adına kayıtlı bir firma zaten mevcut.`)
      if (sameProfile) throw new DemoRequestSafeError("Bu e-posta adresine ait bir kullanıcı hesabı zaten mevcut.")

      const { data: company, error: companyError } = await adminClient.from("companies").insert({
        name: String(demo.company_name).trim(),
        phone: String(demo.phone || "").trim() || null,
        status: "pending_provider_setup",
        is_active: true,
        sender_name: "",
        sender_approved: false,
        sales_status: "pilot",
        expected_monthly_sms_volume: String(demo.monthly_sms_volume || "").trim() || null,
        sales_note: buildCompanySalesNote(demo) || null,
      }).select("id").single()
      if (companyError || !company) throw new Error(companyError?.message || "Firma oluşturulamadı.")
      companyId = company.id

      const { error: linkError } = await adminClient.from("demo_requests").update({
        company_id: companyId,
        last_error: null,
      }).eq("id", id)
      if (linkError) throw new Error(`Demo talebi firmaya bağlanamadı: ${linkError.message}`)
    }

    const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: String(demo.full_name).trim(),
        role: OWNER_ROLE,
        company_id: companyId,
      },
      redirectTo: getResetPasswordRedirectUrl(request.nextUrl.origin),
    })
    if (invite.error || !invite.data.user) throw new Error(invite.error?.message || "Davet maili gönderilemedi.")

    const invitedUser = invite.data.user
    const now = new Date().toISOString()

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: invitedUser.id,
      full_name: String(demo.full_name).trim(),
      email,
      role: OWNER_ROLE,
      company_id: companyId,
      is_active: true,
    })
    if (profileError) throw new Error(`Profil hazırlanamadı: ${profileError.message}`)

    const { error: membershipError } = await adminClient.from("company_users").upsert({
      company_id: companyId,
      user_id: invitedUser.id,
      role: OWNER_ROLE,
      is_active: true,
      invited_at: now,
    }, { onConflict: "company_id,user_id" })
    if (membershipError) throw new Error(`Firma üyeliği hazırlanamadı: ${membershipError.message}`)

    const { data: invitation, error: invitationError } = await adminClient.from("company_invitations").upsert({
      company_id: companyId,
      user_id: invitedUser.id,
      email,
      full_name: String(demo.full_name).trim(),
      role: OWNER_ROLE,
      status: "pending",
      invited_by: userId,
      invited_at: now,
      last_error: null,
    }, { onConflict: "company_id,email" }).select("id").single()
    if (invitationError || !invitation) throw new Error(invitationError?.message || "Davet kaydı oluşturulamadı.")

    const { data: updated, error: updateError } = await adminClient.from("demo_requests").update({
      status: "approved",
      approved_at: now,
      rejected_at: null,
      rejection_reason: null,
      company_id: companyId,
      invitation_id: invitation.id,
      last_email_sent_at: now,
      last_error: null,
    }).eq("id", id).select("*").single()
    if (updateError) throw new Error(`Demo talebi güncellenemedi: ${updateError.message}`)

    return NextResponse.json({
      request: updated,
      company_id: companyId,
      message: "Firma oluşturuldu ve davet maili gönderildi.",
    })
  } catch (error) {
    await recordError(adminClient, id, error, companyId ? { company_id: companyId } : {})
    console.error("[admin-demo-requests:approve]", { requestId: id, companyId, error })
    const message = error instanceof DemoRequestSafeError ? error.message : "Demo talebi onaylanamadı."
    return errorResponse(message, 409)
  }
}

async function rejectDemoRequest(auth: Awaited<ReturnType<typeof requireAdminAuth>>, id: string, reason: string) {
  if (!auth.ok) return auth.response
  const { adminClient } = auth.context
  const { data: demo, error } = await adminClient.from("demo_requests").select("*").eq("id", id).maybeSingle()
  if (error) {
    console.error("[admin-demo-requests:reject:read-demo]", { requestId: id, error })
    return errorResponse("Demo talebi okunamadı.", 500)
  }
  if (!demo) return errorResponse("Demo talebi bulunamadı.", 404)
  if (demo.status === "approved" || demo.company_id) return errorResponse("Firma oluşturulmuş bir demo talebi reddedilemez.")

  const safeName = escapeHtml(String(demo.full_name))
  const safeReason = reason ? escapeHtml(reason) : ""
  const reasonText = reason ? ` Değerlendirme notu: ${reason}` : ""

  try {
    await sendTransactionalEmail({
      to: String(demo.email).trim().toLowerCase(),
      subject: "MSGNEX Demo Talebiniz Hakkında",
      text: `Merhaba ${demo.full_name}, demo talebiniz incelenmiştir. Şu aşamada hesabınızı aktif hale getiremiyoruz. İlerleyen dönemde tekrar başvuru yapabilirsiniz.${reasonText}`,
      html: `<p>Merhaba ${safeName},</p><p>Demo talebiniz incelenmiştir. Şu aşamada hesabınızı aktif hale getiremiyoruz. İlerleyen dönemde tekrar başvuru yapabilirsiniz.</p>${safeReason ? `<p><strong>Değerlendirme notu:</strong> ${safeReason}</p>` : ""}<p>MSGNEX Ekibi</p>`,
    })

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient.from("demo_requests").update({
      status: "rejected",
      rejected_at: now,
      approved_at: null,
      rejection_reason: reason || null,
      last_email_sent_at: now,
      last_error: null,
    }).eq("id", id).select("*").single()
    if (updateError) throw new Error(updateError.message)
    return NextResponse.json({ request: updated, message: "Demo talebi reddedildi ve bilgilendirme maili gönderildi." })
  } catch (mailError) {
    await recordError(adminClient, id, mailError)
    console.error("[admin-demo-requests:reject]", { requestId: id, error: mailError })
    return errorResponse("Demo talebi reddedilemedi.", 500)
  }
}

export async function GET() {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response
  const { data, error } = await auth.context.adminClient.from("demo_requests").select("*").order("created_at", { ascending: false }).limit(250)
  if (error) {
    console.error("[admin-demo-requests:list]", { error })
    return errorResponse("Demo talepleri listelenemedi.", 500)
  }
  return NextResponse.json({ requests: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const body = await request.json()
  if (body.action === "sales_update") return updateSalesFollowUp(auth, body)

  const id = String(body.id ?? "")
  const status = String(body.status ?? "")
  const rejectionReason = String(body.rejection_reason ?? "").trim().slice(0, 1000)
  if (!id) return errorResponse("Demo talebi zorunludur.")

  if (status === "approved") return approveDemoRequest(request, auth, id)
  if (status === "rejected") return rejectDemoRequest(auth, id, rejectionReason)
  if (!SIMPLE_STATUSES.includes(status)) return errorResponse("Talep durumu geçersiz.")

  const { data, error } = await auth.context.adminClient.from("demo_requests")
    .update({ status, last_error: null }).eq("id", id).select("*").maybeSingle()
  if (error) {
    console.error("[admin-demo-requests:update-status]", { requestId: id, status, error })
    return errorResponse("Demo talebi güncellenemedi.", 500)
  }
  if (!data) return errorResponse("Demo talebi bulunamadı.", 404)
  return NextResponse.json({ request: data, message: "Demo talebi güncellendi." })
}
