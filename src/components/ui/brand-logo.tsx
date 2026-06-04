import Image from "next/image"
import { cn } from "@/lib/utils/cn"

interface BrandLogoProps {
  variant?: "full" | "mark"
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizes = {
  sm: { width: 168, height: 42, className: "h-10 w-auto" },
  md: { width: 232, height: 58, className: "h-14 w-auto" },
  lg: { width: 340, height: 85, className: "h-20 w-auto" },
}

export function BrandLogo({ variant = "full", size = "md", className }: BrandLogoProps) {
  const current = sizes[size]

  if (variant === "mark") {
    return (
      <div className={cn("flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-black", className)}>
        <Image
          src="/logo.png"
          alt="MSGNEX"
          width={40}
          height={40}
          className="h-10 w-10 max-w-none object-cover object-left"
          priority
        />
      </div>
    )
  }

  return (
    <Image
      src="/logo.png"
      alt="MSGNEX"
      width={current.width}
      height={current.height}
      className={cn(current.className, "object-contain", className)}
      priority
    />
  )
}
