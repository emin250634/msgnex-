import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

interface StatCardProps {
  title: string
  value: ReactNode
  description?: string
  icon?: ReactNode
  tone?: "blue" | "emerald" | "amber" | "rose" | "slate"
  className?: string
}

const tones = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  slate: "bg-slate-50 text-slate-700 ring-slate-100",
}

export function StatCard({
  title,
  value,
  description,
  icon,
  tone = "slate",
  className,
}: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-gray-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <div className="mt-2 text-2xl font-semibold text-gray-950">{value}</div>
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1", tones[tone])}>
            {icon}
          </div>
        )}
      </div>
      {description && <p className="mt-2 text-sm text-gray-500">{description}</p>}
    </div>
  )
}
