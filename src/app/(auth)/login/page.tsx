"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginInput } from "@/lib/validations/auth"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import toast from "react-hot-toast"

export default function LoginPage() {
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" })
  const [errors, setErrors] = useState<Partial<LoginInput>>({})
  const [loading, setLoading] = useState(false)
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

    const supabase = createClient()
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    setLoading(false)

    if (error || !data.user) {
      const message = error?.message === "Invalid login credentials"
        ? "E-posta veya şifre hatalı"
        : error?.message || "Giriş yapılamadı"
      setApiError(message)
      toast.error(message)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single()

    toast.success("Giriş başarılı!")
    window.location.href = profile?.role === "admin" ? "/admin/dashboard" : "/dashboard"
  }

  return (
    <div className="mx-auto w-full">
      <div className="mb-10 flex justify-center">
        <BrandLogo size="lg" className="max-w-[320px]" />
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-950">Giriş yapın</h1>
        <p className="mt-2 text-sm text-gray-500">
          MSGNEX paneline erişmek için hesap bilgilerinizle devam edin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="E-posta"
          type="email"
          className="rounded-none border-x-0 border-t-0 border-blue-700 px-0 shadow-none focus:border-blue-800 focus:ring-0"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          error={errors.email}
        />
        <Input
          id="password"
          label="Şifre"
          type="password"
          className="rounded-none border-x-0 border-t-0 border-blue-700 px-0 shadow-none focus:border-blue-800 focus:ring-0"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          error={errors.password}
        />

        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <Button type="submit" className="mt-2 w-full bg-blue-700 hover:bg-blue-800" disabled={loading}>
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Hesabınız yok mu?{" "}
        <Link href="/register" className="font-medium text-primary-600 hover:text-primary-500">
          Kaydolun
        </Link>
      </p>
    </div>
  )
}
