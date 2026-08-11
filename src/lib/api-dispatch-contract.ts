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
    status: 409,
    body: { error: "Bu istek halen isleniyor" },
  }
}
