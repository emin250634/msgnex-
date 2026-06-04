import { cn } from "@/lib/utils/cn"

interface LoadingStateProps {
  variant?: "cards" | "table" | "list"
  rows?: number
  className?: string
}

export function LoadingState({ variant = "cards", rows = 4, className }: LoadingStateProps) {
  if (variant === "table") {
    return (
      <div className={cn("rounded-lg border border-gray-200 bg-white", className)}>
        <div className="grid grid-cols-4 gap-4 border-b border-gray-100 bg-gray-50 p-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-4" />)}
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid grid-cols-4 gap-4 p-4">
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-white p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3 w-2/3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn("grid gap-5 md:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-4 h-9 w-24" />
          <Skeleton className="mt-4 h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-gray-200", className)} />
}
