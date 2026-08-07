import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/auth/admin"
import { encryptProviderSecret } from "@/lib/security/provider-secret"

const PROVIDER_NAME = "netgsm"

interface RouteContext {
  params: {
    id: string
  }
}

interface ProviderSettingsRow {
  id: string
  provider_name: string
  is_active: boolean
  usercode: string | null
  encrypted_secret: string | null
  secret_last_changed_at: string | null
  sender_header: string | null
  sender_header_status: string
  connection_status: string
  timeout_ms: number | null
  encoding: string | null
  created_at: string
  updated_at: string
}

interface ProviderWalletRow {
  balance: number
  balance_unit: string | null
  currency: string | null
  last_synced_at: string | null
  sync_status: string
  last_sync_error: string | null
}

function safeSettings(row?: ProviderSettingsRow | null) {
  if (!row) {
    return {
      provider_name: PROVIDER_NAME,
      usercode: null,
      sender_header: null,
      sender_header_status: "unknown",
      connection_status: "not_configured",
      is_active: false,
      timeout_ms: 15000,
      encoding: "TR",
      is_test_mode: false,
      has_secret: false,
      secret_last_changed_at: null,
      created_at: null,
      updated_at: null,
    }
  }

  return {
    provider_name: row.provider_name,
    usercode: row.usercode,
    sender_header: row.sender_header,
    sender_header_status: row.sender_header_status,
    connection_status: row.connection_status,
    is_active: row.is_active,
    timeout_ms: row.timeout_ms,
    encoding: row.encoding,
    is_test_mode: row.encoding === "TEST",
    has_secret: Boolean(row.encrypted_secret),
    secret_last_changed_at: row.secret_last_changed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function safeWallet(row?: ProviderWalletRow | null) {
  if (!row) return null

  return {
    balance: row.balance,
    balance_unit: row.balance_unit,
    currency: row.currency,
    last_synced_at: row.last_synced_at,
    sync_status: row.sync_status,
    last_sync_error: row.last_sync_error,
  }
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient } = auth.context
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", params.id)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 })
    }
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const [{ data: settings }, { data: wallet }] = await Promise.all([
      adminClient
        .from("company_provider_settings")
        .select("id, provider_name, is_active, usercode, encrypted_secret, secret_last_changed_at, sender_header, sender_header_status, connection_status, timeout_ms, encoding, created_at, updated_at")
        .eq("company_id", params.id)
        .eq("provider_name", PROVIDER_NAME)
        .maybeSingle(),
      adminClient
        .from("company_provider_wallets")
        .select("balance, balance_unit, currency, last_synced_at, sync_status, last_sync_error")
        .eq("company_id", params.id)
        .eq("provider_name", PROVIDER_NAME)
        .maybeSingle(),
    ])

    return NextResponse.json({
      provider_settings: safeSettings(settings as ProviderSettingsRow | null),
      wallet: safeWallet(wallet as ProviderWalletRow | null),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, userId } = auth.context
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", params.id)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 })
    }
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const body = await request.json()
    const usercode = String(body.usercode ?? "").trim()
    const secret = String(body.secret ?? "").trim()
    const senderHeader = String(body.sender_header ?? "").trim().toUpperCase()
    const isTestMode = Boolean(body.is_test_mode)
    const encoding = isTestMode ? "TEST" : String(body.encoding ?? "TR").trim() || "TR"
    const timeoutMs = Number(body.timeout_ms ?? 15000)
    const requestedActive = Boolean(body.is_active)
    const effectiveUsercode = isTestMode ? "MSGNEX_TEST" : usercode
    const effectiveSecret = isTestMode && !secret ? "msgnex-test-provider-secret" : secret

    if (!effectiveUsercode) return validationError("Usercode zorunludur")
    if (!senderHeader) return validationError("Sender header zorunludur")
    if (senderHeader.length > 11) return validationError("Sender header en fazla 11 karakter olabilir")
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return validationError("Timeout pozitif bir sayı olmalıdır")

    const { data: existing, error: existingError } = await adminClient
      .from("company_provider_settings")
      .select("id, encrypted_secret")
      .eq("company_id", params.id)
      .eq("provider_name", PROVIDER_NAME)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const hasExistingSecret = Boolean(existing?.encrypted_secret)
    if (!existing && !effectiveSecret) {
      return validationError("Yeni provider kaydı için secret zorunludur")
    }
    if (requestedActive && !effectiveSecret && !hasExistingSecret) {
      return validationError("Provider aktif edilebilmesi için secret zorunludur")
    }

    const encryptedSecret = effectiveSecret ? encryptProviderSecret(effectiveSecret) : existing?.encrypted_secret
    const isActive = requestedActive && Boolean(effectiveUsercode && senderHeader && encryptedSecret)
    const connectionStatus = isActive ? (isTestMode ? "connected" : "not_configured") : "disabled"
    const senderHeaderStatus = isTestMode && isActive ? "approved" : "unknown"

    if (existing?.id) {
      const updatePayload: Record<string, unknown> = {
        usercode: effectiveUsercode,
        sender_header: senderHeader,
        sender_header_status: senderHeaderStatus,
        encoding,
        timeout_ms: timeoutMs,
        is_active: isActive,
        connection_status: connectionStatus,
        updated_by: userId,
      }

      if (effectiveSecret) {
        updatePayload.encrypted_secret = encryptedSecret
        updatePayload.secret_last_changed_at = new Date().toISOString()
      }

      const { error: updateError } = await adminClient
        .from("company_provider_settings")
        .update(updatePayload)
        .eq("id", existing.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      const { error: insertError } = await adminClient
        .from("company_provider_settings")
        .insert({
          company_id: params.id,
          provider_name: PROVIDER_NAME,
          usercode: effectiveUsercode,
          encrypted_secret: encryptedSecret,
          secret_last_changed_at: new Date().toISOString(),
          sender_header: senderHeader,
          sender_header_status: senderHeaderStatus,
          connection_status: connectionStatus,
          is_active: isActive,
          encoding,
          timeout_ms: timeoutMs,
          created_by: userId,
          updated_by: userId,
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    const [{ data: settings }, { data: wallet }] = await Promise.all([
      adminClient
        .from("company_provider_settings")
        .select("id, provider_name, is_active, usercode, encrypted_secret, secret_last_changed_at, sender_header, sender_header_status, connection_status, timeout_ms, encoding, created_at, updated_at")
        .eq("company_id", params.id)
        .eq("provider_name", PROVIDER_NAME)
        .maybeSingle(),
      adminClient
        .from("company_provider_wallets")
        .select("balance, balance_unit, currency, last_synced_at, sync_status, last_sync_error")
        .eq("company_id", params.id)
        .eq("provider_name", PROVIDER_NAME)
        .maybeSingle(),
    ])

    return NextResponse.json({
      provider_settings: safeSettings(settings as ProviderSettingsRow | null),
      wallet: safeWallet(wallet as ProviderWalletRow | null),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}
