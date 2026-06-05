export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white lg:bg-[url('/background.png')] lg:bg-cover lg:bg-center lg:bg-no-repeat">
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-brand-ink/15 via-transparent to-white/10 lg:block" />

      <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(480px,1fr)]">
        <section aria-label="MSGNEX ürün görseli" className="relative hidden lg:block">
          <div className="absolute bottom-8 left-8 flex items-center gap-3 rounded-xl border border-white/10 bg-brand-ink/55 px-4 py-3 text-white shadow-2xl backdrop-blur-xl xl:bottom-10 xl:left-10">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/20 text-primary-200">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold">Kurumsal iletişim merkezi</p>
              <p className="mt-0.5 text-xs text-blue-100/75">SMS operasyonlarınız tek panelde</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:px-14 xl:px-20">
          <div className="w-full max-w-[420px]">{children}</div>
        </section>
      </div>
    </main>
  )
}
