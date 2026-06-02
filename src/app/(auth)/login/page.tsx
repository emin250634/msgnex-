"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginInput } from "@/lib/validations/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import toast from "react-hot-toast"

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" })
  const [errors, setErrors] = useState<Partial<LoginInput>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const msg = error?.message === "Invalid login credentials"
        ? "E-posta veya şifre hatalı"
        : error?.message || "Giriş yapılamadı"
      setApiError(msg)
      toast.error(msg)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single()

    toast.success("Giriş başarılı!")

    const target = profile?.role === "admin" ? "/admin/dashboard" : "/dashboard"
    window.location.href = target
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Msgnex</h1>
        <p className="mt-1 text-sm text-gray-500">Giriş yapın</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="E-posta"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
        />
        <Input
          id="password"
          label="Şifre"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />

        {apiError && (
          <p className="text-sm text-red-600">{apiError}</p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
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
