"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import type { Profile } from "@/types"

interface NavbarProps {
  profile: Profile
}

export function Navbar({ profile }: NavbarProps) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-4 border-b border-gray-200 bg-white px-8">
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{profile.full_name}</p>
          <p className="text-xs text-gray-500 capitalize">{profile.role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Çıkış
        </Button>
      </div>
    </header>
  )
}
