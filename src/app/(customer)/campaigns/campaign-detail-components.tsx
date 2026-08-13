"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { getProviderErrorInfo } from "@/lib/provider-errors"

type ProviderErrorInfo = ReturnType<typeof getProviderErrorInfo>

export function CleanupAction({
  title,
  description,
  action,
  onClick,
  disabled = false,
  primary = false,
}: {
  title: string
  description: string
  action: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-red-100 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-gray-950">{title}</p>
        <p className="mt-2 text-xs leading-5 text-gray-600">{description}</p>
      </div>
      <Button className="mt-4 w-full" variant={primary ? "primary" : "secondary"} size="sm" onClick={onClick} disabled={disabled}>
        {action}
      </Button>
    </div>
  )
}

export function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
      {children}
    </select>
  )
}

export function CancelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-gray-950">{value}</p>
    </div>
  )
}

export function ReportMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "red" | "amber" }) {
  const classes = {
    slate: "border-gray-200 bg-white text-gray-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    red: "border-red-200 bg-red-50 text-red-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  }

  return (
    <div className={`rounded-xl border p-4 ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

export function SummaryBox({ title, value, tone = "neutral" }: { title: string; value: number | string; tone?: "neutral" | "success" | "danger" | "warning" }) {
  const classes = {
    neutral: "border-gray-200 bg-white text-gray-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    danger: "border-red-200 bg-red-50 text-red-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  }

  return (
    <div className={`rounded-lg border p-3 ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{title}</p>
      <p className="mt-1 text-xl font-semibold">{typeof value === "number" ? value.toLocaleString("tr-TR") : value}</p>
    </div>
  )
}

export function ProviderErrorBox({ code, count, info }: { code: string; count: number; info: ProviderErrorInfo }) {
  if (!info) return null

  const classes = {
    warning: "border-amber-200 bg-white text-amber-950",
    danger: "border-red-200 bg-white text-red-950",
    info: "border-blue-200 bg-white text-blue-950",
  }

  return (
    <div className={`rounded-lg border p-3 ${classes[info.severity]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold">{code}</p>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{count} kayıt</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{info.title}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{info.description}</p>
      <p className="mt-2 text-xs font-medium">{info.action}</p>
    </div>
  )
}

export function ProviderErrorInline({ providerName, code }: { providerName?: string | null; code?: string | null }) {
  const info = getProviderErrorInfo(providerName, code)
  if (!info) return <span className="text-xs text-gray-500">-</span>

  return (
    <div>
      <p className="text-xs font-semibold text-gray-950">{info.title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{info.action}</p>
    </div>
  )
}
