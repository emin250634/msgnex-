"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BrandLogo } from "@/components/ui/brand-logo"
import { cn } from "@/lib/utils/cn"
import type { Profile } from "@/types"

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
  | "segments"
  | "automations"
  | "queue"
  | "templates"
  | "suppression"
  | "provider"
  | "api"
  | "companies"
  | "users"
  | "logs"
  | "suspension"
  | "demo"

const customerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "SMS Gönder", href: "/sms", icon: "send" },
  { label: "Kampanyalar", href: "/campaigns", icon: "campaigns" },
  { label: "Gönderim Geçmişi", href: "/history", icon: "history" },
  { label: "Kişiler", href: "/contacts", icon: "contacts" },
  { label: "Gruplar", href: "/groups", icon: "groups" },
  { label: "Segmentler", href: "/segments", icon: "segments" },
  { label: "Otomasyonlar", href: "/automations", icon: "automations" },
  { label: "Otomasyon Kuyruğu", href: "/automation-queue", icon: "queue" },
  { label: "Şablonlar", href: "/templates", icon: "templates" },
  { label: "Kara Liste", href: "/suppression", icon: "suppression" },
  { label: "Provider Bağlantısı", href: "/provider", icon: "provider" },
  { label: "API Anahtarları", href: "/api-keys", icon: "api" },
]

const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" },
  { label: "Firmalar", href: "/admin/companies", icon: "companies" },
  { label: "Demo Talepleri", href: "/admin/demo-requests", icon: "demo" },
  { label: "Kullanıcılar", href: "/admin/users", icon: "users" },
  { label: "Gönderim Kayıtları", href: "/admin/logs", icon: "logs" },
  { label: "Hesap Askıya Alma", href: "/admin/suspension", icon: "suspension" },
]

interface SidebarProps {
  profile: Profile
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ profile, open = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const nav = profile.role === "admin" ? adminNav : customerNav

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-28 items-center border-b border-gray-200 bg-white px-4 shadow-sm">
        <BrandLogo size="md" className="max-w-[242px]" />
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {nav.map((item) => {
          const isActive = pathname === item.href || (item.href === "/automations" && pathname.startsWith("/automations/"))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition-all",
                isActive
                  ? "bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-lg shadow-blue-950/20"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              {isActive && <span className="absolute left-0 top-3 h-7 w-1 rounded-r-full bg-white/80" />}
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  isActive ? "bg-white/20 text-white" : "text-slate-400 group-hover:bg-white/10 group-hover:text-white"
                )}
              >
                <NavIcon name={item.icon} />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 bg-[#071426] shadow-xl lg:block">
        {content}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Menüyü kapat"
            className="absolute inset-0 bg-gray-950/40"
            onClick={onClose}
          />
          <aside className="relative h-full w-[min(20rem,calc(100vw-2rem))] bg-[#071426] shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}

function NavIcon({ name }: { name: IconName }) {
  const common = {
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
  }

  switch (name) {
    case "dashboard":
      return <svg {...common}><path d="M4 13h7V4H4z" /><path d="M13 20h7V4h-7z" /><path d="M4 20h7v-5H4z" /></svg>
    case "send":
      return <svg {...common}><path d="M4 12 20 4l-6 16-3-7z" /><path d="m11 13 4-4" /></svg>
    case "campaigns":
      return <svg {...common}><path d="M5 8h14" /><path d="M5 12h10" /><path d="M5 16h7" /><path d="M4 4h16v16H4z" /></svg>
    case "history":
      return <svg {...common}><path d="M12 8v5l3 2" /><path d="M5 8a8 8 0 1 1-1 4" /><path d="M3 5v4h4" /></svg>
    case "contacts":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="8" r="4" /><path d="M4 5h2" /><path d="M4 12h2" /><path d="M4 19h2" /></svg>
    case "groups":
      return <svg {...common}><path d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="4" /><path d="M23 20v-1a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case "segments":
      return <svg {...common}><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /><path d="M6 5l5 7v5l2 2v-7l5-7" /></svg>
    case "automations":
      return <svg {...common}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><circle cx="12" cy="12" r="5" /><path d="m15.5 8.5 1.5-1.5" /><path d="m7 17 1.5-1.5" /><path d="m8.5 8.5-1.5-1.5" /><path d="m15.5 15.5 1.5 1.5" /></svg>
    case "queue":
      return <svg {...common}><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h8" /><path d="m16 16 2 2 4-4" /></svg>
    case "templates":
      return <svg {...common}><path d="M6 3h8l4 4v17H6z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>
    case "suppression":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8" /></svg>
    case "provider":
      return <svg {...common}><path d="M4 7h16v12H4z" /><path d="M16 7V5H6" /><circle cx="12" cy="13" r="2" /></svg>
    case "api":
      return <svg {...common}><path d="M8 9 4 12l4 3" /><path d="m16 9 4 3-4 3" /><path d="m14 5-4 14" /></svg>
    case "companies":
      return <svg {...common}><path d="M4 21V5h10v16" /><path d="M14 9h6v12" /><path d="M8 9h2" /><path d="M8 13h2" /><path d="M8 17h2" /></svg>
    case "users":
      return <svg {...common}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M17 11a3 3 0 0 1 0 6" /><path d="M22 21a5 5 0 0 0-4-4.9" /></svg>
    case "logs":
      return <svg {...common}><path d="M5 4h14v16H5z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h3" /></svg>
    case "suspension":
      return <svg {...common}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><path d="M12 15v2" /></svg>
    case "demo":
      return <svg {...common}><path d="M4 5h16v12H4z" /><path d="m8 21 4-4 4 4" /><path d="M8 9h8" /><path d="M8 13h5" /></svg>
  }
}
