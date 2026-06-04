"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types"

interface NavbarProps {
  profile: Profile
  onMenuClick?: () => void
}

export function Navbar({ profile, onMenuClick }: NavbarProps) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const primaryAction = profile.role === "admin"
    ? { href: "/admin/companies", label: "Firma Ekle" }
    : { href: "/sms", label: "SMS Gönder" }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-4 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Menüyü aç"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm lg:hidden"
          onClick={onMenuClick}
        >
          <span className="h-4 w-4 border-y-2 border-current" />
        </button>
        <div className="lg:hidden">
          <BrandLogo variant="mark" />
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-base font-semibold text-gray-950">
            {profile.role === "admin" ? "Yönetim Paneli" : "Müşteri Paneli"}
          </p>
          <p className="truncate text-xs text-gray-500">Operasyon görünümü</p>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        <Link href={primaryAction.href} className="hidden sm:block">
          <Button size="sm" className="bg-blue-700 hover:bg-blue-800">
            {primaryAction.label}
          </Button>
        </Link>
        <div className="hidden min-w-0 text-right sm:block">
          <p className="max-w-[180px] truncate text-sm font-semibold text-gray-950">{profile.full_name}</p>
          <p className="text-xs text-gray-500">{profile.role === "admin" ? "Admin" : "Müşteri"}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700 ring-1 ring-blue-100 sm:h-10 sm:w-10">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <Button variant="secondary" size="sm" onClick={handleLogout} className="px-2.5 sm:px-3">
          Çıkış
        </Button>
      </div>
    </header>
  )
}
