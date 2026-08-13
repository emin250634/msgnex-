import { afterEach, describe, expect, it, vi } from "vitest"
import { assertTestProviderAllowed } from "./test-provider-guard"

describe("TEST/Fake SMS provider guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("allows test provider outside production", () => {
    vi.stubEnv("NODE_ENV", "test")

    expect(() => assertTestProviderAllowed()).not.toThrow()
  })

  it("fails closed for direct test provider creation in production", () => {
    vi.stubEnv("NODE_ENV", "production")

    expect(() => assertTestProviderAllowed()).toThrow("Production ortaminda test SMS provider kullanilamaz")
  })
})
