"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils/cn"
import type { Role } from "@/types"

interface NavItem {
  label: string
  href: string
  icon: string
}

const customerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "Kişiler", href: "/contacts", icon: "👤" },
  { label: "Gruplar", href: "/groups", icon: "📁" },
  { label: "SMS Gönder", href: "/sms", icon: "✉️" },
  { label: "Kampanyalar", href: "/campaigns", icon: "SMS" },
  { label: "Kara Liste", href: "/suppression", icon: "BL" },
  { label: "Şablonlar", href: "/templates", icon: "📝" },
  { label: "Gönderim Geçmişi", href: "/history", icon: "📋" },
  { label: "Bakiye", href: "/balance", icon: "💰" },
  { label: "API Anahtarları", href: "/api-keys", icon: "API" },
]

const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "📊" },
  { label: "Firmalar", href: "/admin/companies", icon: "🏢" },
  { label: "Kullanıcılar", href: "/admin/users", icon: "👥" },
  { label: "Kredi Yönetimi", href: "/admin/credits", icon: "💰" },
  { label: "Gönderim Kayıtları", href: "/admin/logs", icon: "📋" },
  { label: "Hesap Askıya Alma", href: "/admin/suspension", icon: "🔒" },
]

interface SidebarProps {
  role: Role
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const nav = role === "admin" ? adminNav : customerNav

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <span className="text-2xl">📨</span>
        <span className="text-xl font-bold text-gray-900">Msgnex</span>
      </div>
      <nav className="space-y-1 p-4">
        {nav.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
