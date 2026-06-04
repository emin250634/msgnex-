export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="hidden bg-[#1f1f1f] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sky-200">
              MSGNEX Inbox API for Developers
            </div>
            <h1 className="mt-8 max-w-md text-4xl font-semibold leading-tight">
              SMS operasyonunuzu daha net, daha hızlı yönetin.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-gray-300">
              Kampanyalar, alıcı listeleri, kredi hareketleri ve provider durumları için profesyonel bir B2B panel.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-gray-300">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium text-white">Provider görünürlüğü</p>
              <p className="mt-1">Netgsm durumları, DLR bekleyen kayıtlar ve kampanya sonuçları tek ekranda.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium text-white">Kurumsal SMS akışı</p>
              <p className="mt-1">Kredi, kişi, grup ve şablon yönetimi sade bir operasyon düzeninde.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  )
}
