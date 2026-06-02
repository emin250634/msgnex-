import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
}

export function Card({ className, title, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white shadow-sm",
        className
      )}
      {...props}
    >
      {title && (
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
