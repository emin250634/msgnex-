import "server-only"

import { timingSafeEqual } from "node:crypto"

export function hasValidWorkerAuthorization(request: Request) {
  const workerSecret = process.env.WORKER_SECRET
  const authorization = request.headers.get("authorization")
  if (!workerSecret || !authorization) return false

  const expected = Buffer.from(`Bearer ${workerSecret}`)
  const actual = Buffer.from(authorization)

  if (actual.length !== expected.length) {
    timingSafeEqual(expected, expected)
    return false
  }

  return timingSafeEqual(actual, expected)
}
