"use client"

import { useState, type ReactNode } from "react"
import { Navbar } from "@/components/layout/navbar"
import { Sidebar } from "@/components/layout/sidebar"
import type { Profile } from "@/types"

interface AppShellProps {
  profile: Profile
  children: ReactNode
}

export function AppShell({ profile, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar profile={profile} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-72">
        <Navbar profile={profile} onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 px-3 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
