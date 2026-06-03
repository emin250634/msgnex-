import { cn } from "@/lib/utils/cn"

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "purple"

interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
}

const tones: Record<StatusTone, string> = {
  neutral: "border-gray-200 bg-gray-50 text-gray-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700",
}

export function StatusBadge({ label, tone = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {label}
    </span>
  )
}
