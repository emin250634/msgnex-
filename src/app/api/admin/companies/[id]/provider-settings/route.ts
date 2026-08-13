import { NextRequest, NextResponse } from "next/server"
import { writeAuditLog } from "@/lib/audit-log"
import { requireAdminAuth } from "@/lib/auth/admin"
import { decryptProviderSecret, encryptProviderSecret } from "@/lib/security/provider-secret"
import { createNetgsmProvider, createTestSmsProvider } from "@/services/sms-provider"
import type { SmsProvider } from "@/services/sms-provider"

const PROVIDER_NAME = "netgsm"

interface RouteContext {
  params: Promise<{
    id: string
  }>
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

interface ProviderSenderHeaderRow {
  header: string
  status: string
  last_synced_at: string | null
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

function safeSenderHeaders(rows?: ProviderSenderHeaderRow[] | null) {
  return (rows ?? []).map((row) => ({
    header: row.header,
    status: row.status,
    last_synced_at: row.last_synced_at,
  }))
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

async function readProviderState(adminClient: any, companyId: string) {
  const [{ data: settings }, { data: wallet }, { data: senderHeaders }] = await Promise.all([
    adminClient
      .from("company_provider_settings")
      .select("id, provider_name, is_active, usercode, encrypted_secret, secret_last_changed_at, sender_header, sender_header_status, connection_status, timeout_ms, encoding, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("provider_name", PROVIDER_NAME)
      .maybeSingle(),
    adminClient
      .from("company_provider_wallets")
      .select("balance, balance_unit, currency, last_synced_at, sync_status, last_sync_error")
      .eq("company_id", companyId)
      .eq("provider_name", PROVIDER_NAME)
      .maybeSingle(),
    adminClient
      .from("company_provider_sender_headers")
      .select("header, status, last_synced_at")
      .eq("company_id", companyId)
      .eq("provider_name", PROVIDER_NAME)
      .order("header", { ascending: true }),
  ])

  return {
    settings: settings as ProviderSettingsRow | null,
    wallet: wallet as ProviderWalletRow | null,
    senderHeaders: senderHeaders as ProviderSenderHeaderRow[] | null,
  }
}

function stateResponse(
  state: { settings: ProviderSettingsRow | null; wallet: ProviderWalletRow | null; senderHeaders?: ProviderSenderHeaderRow[] | null },
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json({
    provider_settings: safeSettings(state.settings),
    wallet: safeWallet(state.wallet),
    sender_headers: safeSenderHeaders(state.senderHeaders),
    ...extra,
  })
}

function createProviderFromSettings(settings: ProviderSettingsRow | null): SmsProvider {
  if (!settings || !settings.usercode || !settings.encrypted_secret) {
    throw new Error("Provider kullanıcı bilgileri eksik")
  }

  if (settings.encoding === "TEST") {
    return createTestSmsProvider()
  }

  return createNetgsmProvider({
    userCode: settings.usercode,
    password: decryptProviderSecret(settings.encrypted_secret),
    defaultHeader: settings.sender_header,
    timeoutMs: settings.timeout_ms,
    encoding: settings.encoding,
  })
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient } = auth.context
    const { id } = await params
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", id)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 })
    }
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    return stateResponse(await readProviderState(adminClient, id))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminAuth()
    if (!auth.ok) return auth.response

    const { adminClient, profile, userId } = auth.context
    const { id } = await params
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", id)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 })
    }
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body.action ?? "").trim()
    if (!["test_connection", "query_headers", "query_credit"].includes(action)) {
      return validationError("Provider aksiyonu geçersiz")
    }

    const state = await readProviderState(adminClient, id)
    const provider = createProviderFromSettings(state.settings)

    if (action === "test_connection") {
      const result = await provider.testConnection?.()
      if (!result) return validationError("Provider bağlantı testi desteklenmiyor")

      const { error: updateError } = await adminClient
        .from("company_provider_settings")
        .update({
          connection_status: result.ok ? "connected" : "error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.settings?.id)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

      await writeAuditLog({
        adminClient,
        actorUserId: userId,
        actorRole: profile.role,
        action: "provider.test_connection",
        targetType: "company_provider_settings",
        targetId: state.settings?.id ?? null,
        companyId: id,
        metadata: {
          provider_name: PROVIDER_NAME,
          ok: result.ok,
          status_code: result.statusCode ?? null,
        },
      })

      return stateResponse(await readProviderState(adminClient, id), {
        action,
        result,
      })
    }

    if (action === "query_headers") {
      const result = await provider.getSenderHeaders?.()
      if (!result) return validationError("Provider başlık sorgusu desteklenmiyor")

      const configuredHeader = state.settings?.sender_header?.trim().toUpperCase() || ""
      const normalizedHeaders = result.headers.map((header) => header.trim().toUpperCase())
      const headerStatus = result.ok
        ? normalizedHeaders.includes(configuredHeader) ? "approved" : "pending"
        : "error"

      if (result.ok) {
        const now = new Date().toISOString()
        const rows = Array.from(new Set(normalizedHeaders)).map((header) => ({
          company_id: id,
          provider_name: PROVIDER_NAME,
          header,
          status: "approved",
          raw_response: result.rawResponse ?? null,
          last_synced_at: now,
        }))

        if (rows.length > 0) {
          const { error: headersError } = await adminClient
            .from("company_provider_sender_headers")
            .upsert(rows, { onConflict: "company_id,provider_name,header" })

          if (headersError) return NextResponse.json({ error: headersError.message }, { status: 500 })
        }
      }

      const { error: updateError } = await adminClient
        .from("company_provider_settings")
        .update({
          sender_header_status: headerStatus,
          connection_status: result.ok ? "connected" : "error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.settings?.id)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

      await writeAuditLog({
        adminClient,
        actorUserId: userId,
        actorRole: profile.role,
        action: "provider.query_headers",
        targetType: "company_provider_settings",
        targetId: state.settings?.id ?? null,
        companyId: id,
        metadata: {
          provider_name: PROVIDER_NAME,
          ok: result.ok,
          header_count: normalizedHeaders.length,
          configured_header_status: headerStatus,
        },
      })

      return stateResponse(await readProviderState(adminClient, id), {
        action,
        result,
      })
    }

    const result = await provider.getCreditStatus?.()
    if (!result) return validationError("Provider kredi sorgusu desteklenmiyor")

    const now = new Date().toISOString()
    const walletPayload = {
      company_id: id,
      provider_name: PROVIDER_NAME,
      balance: result.amount ?? 0,
      balance_unit: result.unit,
      currency: result.currency,
      raw_balance_response: result.rawResponse ?? null,
      last_synced_at: now,
      sync_status: result.ok ? "synced" : "error",
      last_sync_error: result.ok ? null : result.message,
    }

    const { error: walletError } = await adminClient
      .from("company_provider_wallets")
      .upsert(walletPayload, { onConflict: "company_id,provider_name" })

    if (walletError) return NextResponse.json({ error: walletError.message }, { status: 500 })

    await adminClient
      .from("company_provider_settings")
      .update({
        connection_status: result.ok ? "connected" : "error",
        updated_at: now,
      })
      .eq("id", state.settings?.id)

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: "provider.query_credit",
      targetType: "company_provider_settings",
      targetId: state.settings?.id ?? null,
      companyId: id,
      metadata: {
        provider_name: PROVIDER_NAME,
        ok: result.ok,
        balance: result.amount ?? null,
        balance_unit: result.unit ?? null,
        currency: result.currency ?? null,
      },
    })

    return stateResponse(await readProviderState(adminClient, id), {
      action,
      result,
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

    const { adminClient, profile, userId } = auth.context
    const { id } = await params
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id")
      .eq("id", id)
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
    const isTestMode = Boolean(body.is_test_mode)
    const requestedSenderHeader = String(body.sender_header ?? "").trim().toUpperCase()
    const senderHeader = isTestMode && !requestedSenderHeader ? "MSGNEX" : requestedSenderHeader
    const encoding = isTestMode ? "TEST" : String(body.encoding ?? "TR").trim() || "TR"
    const timeoutMs = Number(body.timeout_ms ?? 15000)
    const requestedActive = Boolean(body.is_active)
    const effectiveUsercode = isTestMode ? "MSGNEX_TEST" : usercode
    const effectiveSecret = isTestMode && !secret ? "msgnex-test-provider-secret" : secret

    if (!effectiveUsercode) return validationError("Usercode zorunludur")
    if (requestedActive && !senderHeader) return validationError("Aktif provider için sağlayıcıdan sorgulanmış başlık seçilmelidir")
    if (senderHeader && senderHeader.length > 11) return validationError("Sender header en fazla 11 karakter olabilir")
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return validationError("Timeout pozitif bir sayı olmalıdır")

    const { data: existing, error: existingError } = await adminClient
      .from("company_provider_settings")
      .select("id, encrypted_secret")
      .eq("company_id", id)
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

    if (!isTestMode && senderHeader) {
      const { data: allowedHeader, error: allowedHeaderError } = await adminClient
        .from("company_provider_sender_headers")
        .select("header")
        .eq("company_id", id)
        .eq("provider_name", PROVIDER_NAME)
        .eq("header", senderHeader)
        .eq("status", "approved")
        .maybeSingle()

      if (allowedHeaderError) {
        return NextResponse.json({ error: allowedHeaderError.message }, { status: 500 })
      }
      if (!allowedHeader) {
        return validationError("Başlık manuel girilemez. Önce sağlayıcıdan başlıkları sorgulayın ve listeden seçim yapın.")
      }
    }

    const encryptedSecret = effectiveSecret ? encryptProviderSecret(effectiveSecret) : existing?.encrypted_secret
    const isActive = requestedActive && Boolean(effectiveUsercode && senderHeader && encryptedSecret)
    const connectionStatus = isActive ? (isTestMode ? "connected" : "not_configured") : "disabled"
    const senderHeaderStatus = senderHeader ? "approved" : "unknown"

    if (existing?.id) {
      const updatePayload: Record<string, unknown> = {
        usercode: effectiveUsercode,
        sender_header: senderHeader || null,
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
          company_id: id,
          provider_name: PROVIDER_NAME,
          usercode: effectiveUsercode,
          encrypted_secret: encryptedSecret,
          secret_last_changed_at: new Date().toISOString(),
          sender_header: senderHeader || null,
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
        .eq("company_id", id)
        .eq("provider_name", PROVIDER_NAME)
        .maybeSingle(),
      adminClient
        .from("company_provider_wallets")
        .select("balance, balance_unit, currency, last_synced_at, sync_status, last_sync_error")
        .eq("company_id", id)
        .eq("provider_name", PROVIDER_NAME)
        .maybeSingle(),
    ])

    await writeAuditLog({
      adminClient,
      actorUserId: userId,
      actorRole: profile.role,
      action: existing?.id ? "provider.update" : "provider.create",
      targetType: "company_provider_settings",
      targetId: (settings as ProviderSettingsRow | null)?.id ?? existing?.id ?? null,
      companyId: id,
      metadata: {
        provider_name: PROVIDER_NAME,
        is_active: isActive,
        is_test_mode: isTestMode,
        sender_header: senderHeader || null,
        sender_header_status: senderHeaderStatus,
        connection_status: connectionStatus,
        encoding,
        timeout_ms: timeoutMs,
        secret_changed: Boolean(effectiveSecret),
      },
    })

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
