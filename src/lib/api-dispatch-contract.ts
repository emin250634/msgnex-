import { NextResponse } from "next/server"

export type ExternalApiErrorCode =
  | "INVALID_API_KEY"
  | "PROVIDER_NOT_CONFIGURED"
  | "RATE_LIMIT_EXCEEDED"
  | "INVALID_RECIPIENT"
  | "INVALID_REQUEST"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "DISPATCH_REVIEW_REQUIRED"
  | "DISPATCH_FAILED"
  | "INTERNAL_ERROR"

export const EXTERNAL_API_ERROR_STATUS: Record<ExternalApiErrorCode, number> = {
  INVALID_API_KEY: 401,
  PROVIDER_NOT_CONFIGURED: 403,
  RATE_LIMIT_EXCEEDED: 429,
  INVALID_RECIPIENT: 400,
  INVALID_REQUEST: 400,
  IDEMPOTENCY_IN_PROGRESS: 409,
  DISPATCH_REVIEW_REQUIRED: 409,
  DISPATCH_FAILED: 400,
  INTERNAL_ERROR: 500,
}

export interface ExistingApiDispatch {
  created?: boolean
  status?: string | null
  response?: Record<string, unknown> | null
}

export interface RateLimitedDispatch {
  rate_limited?: boolean
  retry_after_seconds?: number | null
  message?: string | null
}

export interface ApiDispatchDecision {
  shouldSendProvider: boolean
  status: number
  body: Record<string, unknown>
  headers?: Record<string, string>
}

export function rateLimitDecision(dispatch: RateLimitedDispatch): ApiDispatchDecision | null {
  if (!dispatch.rate_limited) return null

  const retryAfterSeconds = dispatch.retry_after_seconds ?? 60
  return {
    shouldSendProvider: false,
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
    body: {
      error: dispatch.message || "API rate limit exceeded",
      errorCode: "RATE_LIMIT_EXCEEDED",
      retryAfterSeconds,
    },
  }
}

export function existingDispatchDecision(dispatch: ExistingApiDispatch): ApiDispatchDecision | null {
  if (dispatch.created) return null

  if (dispatch.status === "completed") {
    return {
      shouldSendProvider: false,
      status: 200,
      body: { ...(dispatch.response ?? {}), reused: true },
    }
  }

  if (dispatch.status === "review_required") {
    return {
      shouldSendProvider: false,
      status: 409,
      body: {
        errorCode: "DISPATCH_REVIEW_REQUIRED",
        error: "Bu istegin provider teslim durumu belirsiz. Yeni SMS gonderilmedi; manuel inceleme gerekiyor.",
        campaignId: dispatch.response?.campaignId ?? null,
      },
    }
  }

  return {
    shouldSendProvider: false,
    status: EXTERNAL_API_ERROR_STATUS.IDEMPOTENCY_IN_PROGRESS,
    body: {
      errorCode: "IDEMPOTENCY_IN_PROGRESS",
      error: "Bu istek halen isleniyor",
    },
  }
}

export function externalApiErrorResponse(
  code: ExternalApiErrorCode,
  message: string,
  init: { retryAfterSeconds?: number; headers?: Record<string, string> } = {}
) {
  return NextResponse.json(
    {
      error: message,
      errorCode: code,
      ...(init.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: init.retryAfterSeconds }),
    },
    {
      status: EXTERNAL_API_ERROR_STATUS[code],
      headers: init.headers,
    }
  )
}
