"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginInput } from "@/lib/validations/auth"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { getResetPasswordRedirectUrl } from "@/lib/utils/app-url"
import toast from "react-hot-toast"

export default function LoginPage() {
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Partial<LoginInput>>({})
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [apiError, setApiError] = useState("")

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setApiError("")

    const result = loginSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      })
      return
    }
    setErrors({})
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })

      if (error || !data.user) {
        throw new Error(error?.message === "Invalid login credentials"
          ? "E-posta veya şifre hatalı"
          : error?.message || "Giriş yapılamadı")
      }

      const invitationResponse = await fetch("/api/auth/accept-company-invitations", {
        method: "POST",
      })
      const invitationResult = await invitationResponse.json().catch(() => null)
      if (!invitationResponse.ok) {
        throw new Error(invitationResult?.error || "Davet kabul işlemi tamamlanamadı.")
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.user.id)
        .maybeSingle()

      if (profileError) {
        throw new Error(`Profil bilgisi okunamadı: ${profileError.message}`)
      }

      if (!profile?.is_active) {
        throw new Error("Hesabınız aktif değil. Lütfen sistem yöneticisiyle iletişime geçin.")
      }

      if (profile.role === "admin") {
        toast.success("Giriş başarılı!")
        window.location.assign("/admin/dashboard")
        return
      }

      const { data: membership, error: membershipError } = await supabase
        .from("company_users")
        .select("company_id, role, accepted_at")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .not("accepted_at", "is", null)
        .limit(1)
        .maybeSingle()

      if (membershipError) {
        throw new Error(`Firma üyeliği doğrulanamadı: ${membershipError.message}`)
      }

      if (!membership) {
        throw new Error("Hesabınız aktif bir firmaya bağlı değil veya davet kabul işlemi tamamlanmamış.")
      }

      toast.success("Giriş başarılı!")
      window.location.assign("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Giriş işlemi tamamlanamadı."
      setApiError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    const email = form.email.trim()
    if (!email || !email.includes("@")) {
      toast.error("Şifre sıfırlama için e-posta adresinizi girin")
      return
    }

    setResetLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetPasswordRedirectUrl(window.location.origin),
      })
      if (error) throw error
      toast.success("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Şifre sıfırlama bağlantısı gönderilemedi")
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-10 flex items-center justify-between">
        <BrandLogo size="lg" className="h-12 max-w-[230px] sm:h-14" />
        <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Güvenli erişim
        </span>
      </div>

      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase text-brand-action">Yönetim Paneli</p>
        <h1 className="text-3xl font-semibold text-brand-ink">Tekrar hoş geldiniz</h1>
        <p className="mt-3 text-sm leading-6 text-brand-muted">
          Hesabınıza giriş yaparak iletişim operasyonlarınıza kaldığınız yerden devam edin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-brand-line/80 bg-white/85 p-5 shadow-[0_18px_50px_-28px_rgba(7,21,47,0.3)] backdrop-blur-sm sm:p-6">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-brand-ink">E-posta adresi</label>
          <div className="relative">
            <MailIcon />
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ornek@firma.com"
              className="block h-12 w-full rounded-xl border border-brand-line bg-white px-11 text-sm text-brand-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-primary-300 focus:border-brand-action focus:ring-4 focus:ring-primary-100"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label htmlFor="password" className="block text-sm font-semibold text-brand-ink">Şifre</label>
            <button
              type="button"
              className="text-xs font-semibold text-brand-action transition hover:text-brand-action-hover disabled:opacity-60"
              disabled={resetLoading}
              onClick={handleResetPassword}
            >
              {resetLoading ? "Gönderiliyor..." : "Şifremi unuttum"}
            </button>
          </div>
          <div className="relative">
            <LockIcon />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Şifrenizi girin"
              className="block h-12 w-full rounded-xl border border-brand-line bg-white px-11 pr-12 text-sm text-brand-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-primary-300 focus:border-brand-action focus:ring-4 focus:ring-primary-100"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <button
              type="button"
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-brand-muted transition hover:bg-primary-50 hover:text-brand-action focus:outline-none focus:ring-2 focus:ring-primary-200"
              onClick={() => setShowPassword((current) => !current)}
            >
              <EyeIcon hidden={showPassword} />
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>}
        </div>

        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <Button type="submit" size="lg" className="mt-1 h-12 w-full rounded-xl bg-brand-action text-sm shadow-lg shadow-primary-200/70 transition-all hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-xl focus:ring-brand-action" disabled={loading}>
          <span>{loading ? "Giriş yapılıyor..." : "Giriş yap"}</span>
          {!loading && <ArrowIcon />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-muted">
        Hesabınız yok mu?{" "}
        <Link href="/register" className="font-semibold text-brand-action transition hover:text-brand-action-hover">
          Yeni hesap oluşturun
        </Link>
      </p>

      <div className="mt-10 flex items-center justify-center gap-5 text-xs text-slate-400">
        <span>256-bit güvenlik</span>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <span>Kurumsal erişim</span>
      </div>
    </div>
  )
}

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-muted">
      <path d="M4 6.75h16v10.5H4V6.75Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-muted">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.7" />
      {hidden && <path d="m5 4 14 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="ml-2 h-4 w-4">
      <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
