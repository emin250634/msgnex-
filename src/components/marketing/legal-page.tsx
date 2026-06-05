import Link from "next/link"
import { BrandLogo } from "@/components/ui/brand-logo"

export function LegalPage({ title, description }: { title: string; description: string }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/"><BrandLogo size="sm" className="max-w-[180px]" /></Link>
          <Link href="/" className="text-sm font-semibold text-blue-700 hover:text-blue-800">Ana Sayfa</Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <h1 className="text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-5 text-base leading-8 text-slate-600">{description}</p>
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          MSGNEX kontrollü beta sürecindedir. Nihai hukuki metinler şirket kuruluşu ve hukuk danışmanı onayı sonrasında yayınlanacaktır.
        </div>
      </article>
    </main>
  )
}
