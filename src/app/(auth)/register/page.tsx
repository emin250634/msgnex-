"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { registerSchema, type RegisterInput } from "@/lib/validations/auth"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import toast from "react-hot-toast"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState<RegisterInput>({
    full_name: "",
    email: "",
    password: "",
    company_name: "",
  })
  const [errors, setErrors] = useState<Partial<RegisterInput>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState("")

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setApiError("")

    const result = registerSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      setErrors({
        full_name: fieldErrors.full_name?.[0],
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
        company_name: fieldErrors.company_name?.[0],
      })
      return
    }
    setErrors({})

    const supabase = createClient()
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          company_name: form.company_name,
        },
      },
    })

    setLoading(false)

    if (error) {
      setApiError(error.message)
      return
    }

    if (data.user) {
      if (data.session) {
        const { error: onboardingError } = await supabase.rpc(
          "complete_customer_onboarding",
          { p_company_name: form.company_name }
        )

        if (onboardingError) {
          setApiError("Firma kaydı tamamlanamadı: " + onboardingError.message)
          return
        }
      }

      toast.success("Hesabınız oluşturuldu! Hoş geldiniz.")

      if (!data.session) {
        setTimeout(() => router.push("/login"), 500)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single()

      if (profile) {
        setTimeout(() => {
          router.push(profile.role === "admin" ? "/admin/dashboard" : "/dashboard")
          router.refresh()
        }, 500)
      }
    }
  }

  return (
    <div className="mx-auto w-full">
      <div className="mb-10 flex justify-center">
        <BrandLogo size="lg" className="max-w-[320px]" />
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-950">Yeni hesap oluşturun</h1>
        <p className="mt-2 text-sm text-gray-500">
          Firma hesabınızı oluşturun ve SMS operasyonlarını tek panelden yönetin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="full_name"
          label="Ad Soyad"
          className="rounded-none border-x-0 border-t-0 border-blue-700 px-0 shadow-none focus:border-blue-800 focus:ring-0"
          value={form.full_name}
          onChange={(event) => setForm({ ...form, full_name: event.target.value })}
          error={errors.full_name}
        />
        <Input
          id="company_name"
          label="Firma Adı"
          className="rounded-none border-x-0 border-t-0 border-blue-700 px-0 shadow-none focus:border-blue-800 focus:ring-0"
          value={form.company_name}
          onChange={(event) => setForm({ ...form, company_name: event.target.value })}
          error={errors.company_name}
        />
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
          {loading ? "Kaydediliyor..." : "Kaydol"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Zaten hesabınız var mı?{" "}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-500">
          Giriş yapın
        </Link>
      </p>
    </div>
  )
}
