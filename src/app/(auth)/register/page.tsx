"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { registerSchema, type RegisterInput } from "@/lib/validations/auth"
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const companyRes = await supabase
        .from("companies")
        .insert({ name: form.company_name })
        .select()
        .single()

      if (companyRes.data) {
        await supabase
          .from("profiles")
          .update({ company_id: companyRes.data.id })
          .eq("id", data.user.id)

        await supabase
          .from("sms_credits")
          .insert({ company_id: companyRes.data.id, balance: 100 })
      }

      toast.success("Hesabınız oluşturuldu! Hoş geldiniz.")

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
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Msgnex</h1>
        <p className="mt-1 text-sm text-gray-500">Yeni hesap oluşturun</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="full_name"
          label="Ad Soyad"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          error={errors.full_name}
        />
        <Input
          id="company_name"
          label="Firma Adı"
          value={form.company_name}
          onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          error={errors.company_name}
        />
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
