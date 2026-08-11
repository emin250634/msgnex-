import { afterEach, describe, expect, it, vi } from "vitest"
import { encryptProviderSecret } from "../lib/security/provider-secret"
import {
  createCompanySmsProvider,
  mapProviderResultsToDispatchResults,
  SmsProviderConfigurationError,
} from "./company-sms-provider"

function supabaseWithProviderRow(data: Record<string, unknown> | null, error: { message: string } | null = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
  }

  return {
    from: vi.fn(() => query),
    query,
  }
}

describe("company SMS provider service", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("creates an active Netgsm provider from company settings", async () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("PROVIDER_SECRET_ENCRYPTION_KEY", "test-encryption-key")
    const encryptedSecret = encryptProviderSecret("netgsm-password")
    const { from, query } = supabaseWithProviderRow({
      is_active: true,
      usercode: "123456",
      encrypted_secret: encryptedSecret,
      sender_header: "MSGNEX",
      timeout_ms: 5000,
      encoding: "TR",
    })

    const provider = await createCompanySmsProvider({ from }, "company-1")

    expect(provider).toHaveProperty("sendBulkSms")
    expect(query.select).toHaveBeenCalledWith("provider_name, is_active, usercode, encrypted_secret, sender_header, timeout_ms, encoding")
    expect(query.eq).toHaveBeenCalledWith("company_id", expect.any(String))
    expect(query.eq).toHaveBeenCalledWith("provider_name", "netgsm")
  })

  it("fails closed when provider config is missing or inactive", async () => {
    await expect(createCompanySmsProvider({ from: supabaseWithProviderRow(null).from }, "company-1")).rejects.toBeInstanceOf(SmsProviderConfigurationError)
    await expect(createCompanySmsProvider({
      from: supabaseWithProviderRow({
        is_active: false,
        usercode: "123456",
        encrypted_secret: "secret",
        sender_header: "MSGNEX",
      }).from,
    }, "company-1")).rejects.toBeInstanceOf(SmsProviderConfigurationError)
  })

  it("allows TEST provider outside production and blocks it in production", async () => {
    const row = {
      is_active: true,
      usercode: "MSGNEX_TEST",
      encrypted_secret: "test-secret",
      sender_header: "MSGNEX",
      timeout_ms: 5000,
      encoding: "TEST",
    }

    vi.stubEnv("NODE_ENV", "test")
    await expect(createCompanySmsProvider({ from: supabaseWithProviderRow(row).from }, "company-1")).resolves.toHaveProperty("sendBulkSms")

    vi.stubEnv("NODE_ENV", "production")
    await expect(createCompanySmsProvider({ from: supabaseWithProviderRow(row).from }, "company-1")).rejects.toThrow("Production ortaminda test SMS provider kullanilamaz")
  })

  it("re-exports provider result normalization with fail-closed missing result behavior", () => {
    expect(mapProviderResultsToDispatchResults([{ id: "message-1" }], [])).toEqual([
      expect.objectContaining({
        id: "message-1",
        success: false,
        accepted: false,
        error: "Provider sonucu eksik",
      }),
    ])
  })
})
