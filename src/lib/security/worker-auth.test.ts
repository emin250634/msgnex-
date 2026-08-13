import { afterEach, describe, expect, it } from "vitest"
import { hasValidWorkerAuthorization } from "./worker-auth"

const originalWorkerSecret = process.env.WORKER_SECRET

afterEach(() => {
  process.env.WORKER_SECRET = originalWorkerSecret
})

function request(authorization?: string) {
  return new Request("https://msgnex.com/api/v1/worker/process", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  })
}

describe("worker authorization", () => {
  it("allows the exact bearer secret", () => {
    process.env.WORKER_SECRET = "worker-secret"

    expect(hasValidWorkerAuthorization(request("Bearer worker-secret"))).toBe(true)
  })

  it("rejects wrong or missing secrets", () => {
    process.env.WORKER_SECRET = "worker-secret"

    expect(hasValidWorkerAuthorization(request("Bearer wrong-secret"))).toBe(false)
    expect(hasValidWorkerAuthorization(request())).toBe(false)
  })

  it("fails closed when WORKER_SECRET is missing", () => {
    delete process.env.WORKER_SECRET

    expect(hasValidWorkerAuthorization(request("Bearer worker-secret"))).toBe(false)
  })
})
