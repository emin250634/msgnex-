import Link from "next/link"
import { BrandLogo } from "@/components/ui/brand-logo"

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full">
      <div className="mb-10 flex justify-center">
        <BrandLogo size="lg" className="max-w-[320px]" />
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-6 text-center shadow-xl shadow-blue-950/10">
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Kontrollü Beta</span>
        <h1 className="mt-5 text-2xl font-semibold text-gray-950">Kurumsal SMS ve İletişim Platformu</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">MSGNEX şu anda kontrollü beta sürecindedir. Yeni hesaplar firma doğrulaması ve yönetici onayı sonrasında açılmaktadır.</p>
        <p className="mt-3 text-sm leading-6 text-gray-600">SMS, API, kampanya yönetimi, raporlama ve kurumsal iletişim araçlarını tek panelden yönetin.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          Giriş Yap
        </Link>
        <Link href="/demo-request" className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50">Demo Talep Et</Link>
      </div>
    </div>
  )
}
