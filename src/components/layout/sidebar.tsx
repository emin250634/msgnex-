"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils/cn"
import type { Role } from "@/types"

interface NavItem {
  label: string
  href: string
  icon: IconName
}

type IconName =
  | "dashboard"
  | "send"
  | "campaigns"
  | "history"
  | "contacts"
  | "groups"
  | "templates"
  | "suppression"
  | "balance"
  | "api"
  | "companies"
  | "users"
  | "credits"
  | "logs"
  | "suspension"

const customerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "SMS Gönder", href: "/sms", icon: "send" },
  { label: "Kampanyalar", href: "/campaigns", icon: "campaigns" },
  { label: "Gönderim Geçmişi", href: "/history", icon: "history" },
  { label: "Kişiler", href: "/contacts", icon: "contacts" },
  { label: "Gruplar", href: "/groups", icon: "groups" },
  { label: "Şablonlar", href: "/templates", icon: "templates" },
  { label: "Kara Liste", href: "/suppression", icon: "suppression" },
  { label: "Bakiye", href: "/balance", icon: "balance" },
  { label: "API Anahtarları", href: "/api-keys", icon: "api" },
]

const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" },
  { label: "Firmalar", href: "/admin/companies", icon: "companies" },
  { label: "Kullanıcılar", href: "/admin/users", icon: "users" },
  { label: "Kredi Yönetimi", href: "/admin/credits", icon: "credits" },
  { label: "Gönderim Kayıtları", href: "/admin/logs", icon: "logs" },
  { label: "Hesap Askıya Alma", href: "/admin/suspension", icon: "suspension" },
]

interface SidebarProps {
  role: Role
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ role, open = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const nav = role === "admin" ? adminNav : customerNav

  const content = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-sm font-semibold text-white">
          M
        </div>
        <div>
          <p className="text-base font-semibold text-gray-950">MSGNEX</p>
          <p className="text-xs text-gray-500">SMS Platformu</p>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {nav.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  isActive ? "bg-primary-100 text-primary-700" : "text-gray-400"
                )}
              >
                <NavIcon name={item.icon} />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-gray-200 bg-white lg:block">
        {content}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Menüyü kapat"
            className="absolute inset-0 bg-gray-950/30"
            onClick={onClose}
          />
          <aside className="relative h-full w-72 border-r border-gray-200 bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}

function NavIcon({ name }: { name: IconName }) {
  const common = {
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
  }

  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <path d="M4 13h7V4H4z" />
          <path d="M13 20h7V4h-7z" />
          <path d="M4 20h7v-5H4z" />
        </svg>
      )
    case "send":
      return (
        <svg {...common}>
          <path d="M4 12 20 4l-6 16-3-7z" />
          <path d="m11 13 4-4" />
        </svg>
      )
    case "campaigns":
      return (
        <svg {...common}>
          <path d="M5 8h14" />
          <path d="M5 12h10" />
          <path d="M5 16h7" />
          <path d="M4 4h16v16H4z" />
        </svg>
      )
    case "history":
      return (
        <svg {...common}>
          <path d="M12 8v5l3 2" />
          <path d="M5 8a8 8 0 1 1-1 4" />
          <path d="M3 5v4h4" />
        </svg>
      )
    case "contacts":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
          <circle cx="12" cy="8" r="4" />
          <path d="M4 5h2" />
          <path d="M4 12h2" />
          <path d="M4 19h2" />
        </svg>
      )
    case "groups":
      return (
        <svg {...common}>
          <path d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 20v-1a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case "templates":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v17H6z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h6" />
        </svg>
      )
    case "suppression":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 8 8 8" />
        </svg>
      )
    case "balance":
      return (
        <svg {...common}>
          <path d="M4 7h16v12H4z" />
          <path d="M16 7V5H6" />
          <circle cx="12" cy="13" r="2" />
        </svg>
      )
    case "api":
      return (
        <svg {...common}>
          <path d="M8 9 4 12l4 3" />
          <path d="m16 9 4 3-4 3" />
          <path d="m14 5-4 14" />
        </svg>
      )
    case "companies":
      return (
        <svg {...common}>
          <path d="M4 21V5h10v16" />
          <path d="M14 9h6v12" />
          <path d="M8 9h2" />
          <path d="M8 13h2" />
          <path d="M8 17h2" />
        </svg>
      )
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21a7 7 0 0 1 14 0" />
          <path d="M17 11a3 3 0 0 1 0 6" />
          <path d="M22 21a5 5 0 0 0-4-4.9" />
        </svg>
      )
    case "credits":
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M17 7H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    case "logs":
      return (
        <svg {...common}>
          <path d="M5 4h14v16H5z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </svg>
      )
    case "suspension":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          <path d="M12 15v2" />
        </svg>
      )
  }
}
