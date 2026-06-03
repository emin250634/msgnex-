import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

interface ToolbarProps {
  children?: ReactNode
  actions?: ReactNode
  className?: string
}

export function Toolbar({ children, actions, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
