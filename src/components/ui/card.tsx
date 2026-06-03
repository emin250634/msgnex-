import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
}

export function Card({ className, title, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white shadow-sm",
        className
      )}
      {...props}
    >
      {title && (
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-950">{title}</h3>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
