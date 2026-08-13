import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { assertSameOriginRequest } from "@/lib/security/request-origin"

const STATUSES = ["new", "contacted", "closed"] as const

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isStatus(value: string): value is (typeof STATUSES)[number] {
  return STATUSES.includes(value as (typeof STATUSES)[number])
}

export async function GET() {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { adminClient } = auth.context
  const { data: requests, error } = await adminClient
    .from("plan_upgrade_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250)

  if (error) {
    console.error("[admin-plan-upgrade-requests:list]", { error })
    return errorResponse("Plan talepleri listelenemedi.", 500)
  }

  const companyIds = Array.from(new Set((requests ?? []).map((item) => item.company_id).filter(Boolean)))
  const companyMap = new Map<string, string>()

  if (companyIds.length > 0) {
    const { data: companies, error: companiesError } = await adminClient
      .from("companies")
      .select("id, name")
      .in("id", companyIds)

    if (companiesError) {
      console.error("[admin-plan-upgrade-requests:list-companies]", { companyIds, error: companiesError })
      return errorResponse("Firma bilgileri okunamadı.", 500)
    }
    companies?.forEach((company) => companyMap.set(company.id, company.name))
  }

  return NextResponse.json({
    requests: (requests ?? []).map((item) => ({
      ...item,
      company_name: companyMap.get(item.company_id) ?? "Firma bulunamadı",
    })),
  })
}

export async function PATCH(request: NextRequest) {
  const originError = assertSameOriginRequest(request)
  if (originError) return originError

  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? "")
  const status = String(body.status ?? "")
  const adminNote = String(body.admin_note ?? "").trim().slice(0, 1000) || null

  if (!id) return errorResponse("Plan talebi zorunludur.")
  if (!isStatus(status)) return errorResponse("Talep durumu geçersiz.")

  const now = new Date().toISOString()
  const { data, error } = await auth.context.adminClient
    .from("plan_upgrade_requests")
    .update({
      status,
      admin_note: adminNote,
      reviewed_by: auth.context.userId,
      reviewed_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("[admin-plan-upgrade-requests:update]", { requestId: id, status, error })
    return errorResponse("Plan talebi güncellenemedi.", 500)
  }
  if (!data) return errorResponse("Plan talebi bulunamadı.", 404)

  return NextResponse.json({ request: data, message: "Plan talebi güncellendi." })
}
