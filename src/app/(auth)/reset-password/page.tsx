"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { Session } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import toast from "react-hot-toast"

const invalidLinkMessage = "Davet veya şifre sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Lütfen yeni bağlantı isteyin."

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [linkError, setLinkError] = useState("")

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const establishSession = async () => {
      setCheckingSession(true)
      setLinkError("")

      const queryError = searchParams.get("error")
      if (queryError) {
        if (mounted) {
          setLinkError(invalidLinkMessage)
          setCheckingSession(false)
        }
        return
      }

      const code = searchParams.get("code")
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          if (mounted) {
            setLinkError(invalidLinkMessage)
            setCheckingSession(false)
          }
          return
        }
        window.history.replaceState({}, document.title, window.location.pathname)
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      const accessToken = hash.get("access_token")
      const refreshToken = hash.get("refresh_token")
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          if (mounted) {
            setLinkError(invalidLinkMessage)
            setCheckingSession(false)
          }
          return
        }
        window.history.replaceState({}, document.title, window.location.pathname)
      }

      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      if (!data.session) {
        setSession(null)
        setLinkError(invalidLinkMessage)
      } else {
        setSession(data.session)
      }
      setCheckingSession(false)
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      if (nextSession) {
        setSession(nextSession)
        setLinkError("")
        setCheckingSession(false)
      }
    })

    establishSession()

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [searchParams])

  const canSubmit = Boolean(session) && !checkingSession && !loading

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!session) {
      setLinkError(invalidLinkMessage)
      return
    }
    if (password.length < 8) {
      toast.error("Şifre en az 8 karakter olmalıdır")
      return
    }
    if (password !== confirmPassword) {
      toast.error("Şifreler eşleşmiyor")
      return
    }

    setLoading(true)
    setLinkError("")

    try {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        setSession(null)
        setLinkError(invalidLinkMessage)
        return
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      const acceptanceResponse = await fetch("/api/auth/accept-company-invitations", {
        method: "POST",
      })
      const acceptanceResult = await acceptanceResponse.json().catch(() => null)

      if (!acceptanceResponse.ok) {
        throw new Error(acceptanceResult?.error || "Davet kabul işlemi tamamlanamadı.")
      }
      toast.success("Şifreniz güncellendi")
      window.location.assign("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Şifre güncelleme işlemi tamamlanamadı."
      console.error("[reset-password]", error)
      setLinkError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full">
      <div className="mb-10 flex justify-center">
        <BrandLogo size="lg" className="max-w-[320px]" />
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-950">Şifre Oluştur</h1>
        <p className="mt-2 text-sm text-gray-500">
          Davet veya şifre sıfırlama bağlantısından geldiyseniz yeni şifrenizi belirleyin.
        </p>
      </div>

      {checkingSession && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Davet bağlantısı doğrulanıyor...
        </div>
      )}

      {linkError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {linkError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Yeni şifre"
          type="password"
          className="rounded-none border-x-0 border-t-0 border-blue-700 px-0 shadow-none focus:border-blue-800 focus:ring-0"
          value={password}
          disabled={!canSubmit}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          label="Yeni şifre tekrar"
          type="password"
          className="rounded-none border-x-0 border-t-0 border-blue-700 px-0 shadow-none focus:border-blue-800 focus:ring-0"
          value={confirmPassword}
          disabled={!canSubmit}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <Button type="submit" className="mt-2 w-full bg-blue-700 hover:bg-blue-800" disabled={!canSubmit}>
          {loading ? "Güncelleniyor..." : "Şifreyi Kaydet"}
        </Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-slate-100" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
