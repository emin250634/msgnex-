"use client"

import { useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Input } from "@/components/ui/input"

const volumes = ["1.000 altı", "1.000 - 10.000", "10.000 - 50.000", "50.000 - 250.000", "250.000+"]
const providerStatuses = [
  ["", "Seçin"],
  ["yes", "Evet, mevcut sağlayıcımız var"],
  ["planning", "Araştırma / teklif aşamasındayız"],
  ["no", "Henüz sağlayıcımız yok"],
]

export default function DemoRequestPage() {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    phone: "",
    email: "",
    monthly_sms_volume: "",
    has_sms_provider: "",
    sms_provider_name: "",
    message: "",
    website: "",
  })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Demo talebi gönderilemedi.")
      setSubmitted(true)
      toast.success("Demo talebiniz alındı.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo talebi gönderilemedi.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="MSGNEX ana sayfa"><BrandLogo size="sm" className="max-w-[190px]" /></Link>
          <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-blue-700">Giriş Yap</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(520px,1fr)] lg:py-16">
        <div className="pt-4">
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Kontrollü Beta</span>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold text-slate-950 sm:text-5xl">İletişim operasyonunuzu birlikte planlayalım.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Ekibimiz firma ihtiyaçlarınızı, aylık SMS hacminizi ve entegrasyon beklentilerinizi değerlendirerek sizinle iletişime geçer.
          </p>
          <div className="mt-8 space-y-4 text-sm text-slate-700">
            {["Firma doğrulaması ve ihtiyaç analizi", "Güvenli provider bağlantı planı", "Kontrollü onboarding ve kullanım desteği"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>{item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
          {submitted ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</span>
              <h2 className="mt-5 text-2xl font-semibold text-slate-950">Talebiniz alındı</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Ekibimiz firma bilgilerinizi inceleyerek sizinle iletişime geçecek.</p>
              <Link href="/" className="mt-6 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Ana Sayfaya Dön</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-950">Demo talep formu</h2>
              <p className="mt-1 text-sm text-slate-500">Size ulaşabilmemiz için temel bilgileri paylaşın.</p>
              <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
                <Input id="full_name" label="Ad Soyad" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                <Input id="company_name" label="Firma Adı" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                <Input id="phone" label="Telefon" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input id="email" label="E-posta" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <div className="sm:col-span-2">
                  <label htmlFor="monthly_sms_volume" className="mb-1 block text-sm font-medium text-gray-700">Aylık SMS Hacmi</label>
                  <select id="monthly_sms_volume" required value={form.monthly_sms_volume} onChange={(e) => setForm({ ...form, monthly_sms_volume: e.target.value })} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Seçin</option>
                    {volumes.map((volume) => <option key={volume}>{volume}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="has_sms_provider" className="mb-1 block text-sm font-medium text-gray-700">Mevcut SMS sağlayıcınız var mı?</label>
                  <select id="has_sms_provider" required value={form.has_sms_provider} onChange={(e) => setForm({ ...form, has_sms_provider: e.target.value })} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    {providerStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <Input id="sms_provider_name" label="Varsa sağlayıcı adı" value={form.sms_provider_name} onChange={(e) => setForm({ ...form, sms_provider_name: e.target.value })} />
                <div className="hidden" aria-hidden="true"><Input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                <div className="sm:col-span-2">
                  <label htmlFor="message" className="mb-1 block text-sm font-medium text-gray-700">Mesaj</label>
                  <textarea id="message" rows={4} maxLength={1500} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="block w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="İhtiyaçlarınızı kısaca paylaşın." />
                </div>
                <button disabled={loading} className="sm:col-span-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-60">
                  {loading ? "Gönderiliyor..." : "Demo Talep Et"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
