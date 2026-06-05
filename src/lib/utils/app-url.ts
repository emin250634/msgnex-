export function getAppUrl(fallback?: string) {
  return process.env.NEXT_PUBLIC_APP_URL || fallback || "http://localhost:3000"
}

export function getResetPasswordRedirectUrl(fallback?: string) {
  return `${getAppUrl(fallback).replace(/\/$/, "")}/reset-password`
}
