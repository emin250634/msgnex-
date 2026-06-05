import Link from "next/link"
import { BrandLogo } from "@/components/ui/brand-logo"

const features = [
  ["Toplu SMS", "Segmentlerinize kontrollü ve ölçülebilir toplu gönderimler hazırlayın.", "send"],
  ["SMS API", "İş uygulamalarınızı güvenli ve izlenebilir SMS altyapısıyla bağlayın.", "api"],
  ["Gelişmiş Raporlama", "Gönderim, provider ve teslimat durumlarını tek merkezden izleyin.", "chart"],
  ["Rehber Yönetimi", "Kişileri, grupları ve segmentleri düzenli bir CRM yapısında yönetin.", "contacts"],
  ["Kampanya Yönetimi", "Kampanyaları hazırlayın, onaylayın ve operasyon sürecini takip edin.", "campaign"],
  ["Çoklu Firma Desteği", "Firma, kullanıcı ve rol yönetimini kontrollü biçimde yönetin.", "company"],
  ["Güvenli Altyapı", "Rol tabanlı erişim, güvenli secret yönetimi ve operasyon kayıtları.", "shield"],
]

export default function Home() {
  return (
    <main className="bg-white text-slate-950">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#06152b]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="MSGNEX ana sayfa" className="rounded-lg bg-white px-3 py-2">
            <BrandLogo size="sm" className="max-w-[170px]" />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
            <a href="#platform" className="hover:text-white">Platform</a>
            <a href="#guvenlik" className="hover:text-white">Güvenlik</a>
            <a href="#iletisim" className="hover:text-white">İletişim</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Giriş Yap</Link>
            <Link href="/demo-request" className="hidden rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:inline-flex">Demo Talep Et</Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-[min(860px,92vh)] overflow-hidden bg-[#06152b] pt-20 text-white">
        <div className="absolute inset-0 bg-[url('/background.png')] bg-cover bg-[position:34%_center] opacity-55" />
        <div className="absolute inset-0 bg-[#06152b]/45" />
        <div className="relative mx-auto flex min-h-[calc(min(860px,92vh)-5rem)] max-w-7xl items-center px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur">Kontrollü Beta Programı</span>
            <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-6xl lg:text-7xl">Kurumsal SMS Operasyonlarınızı Tek Panelden Yönetin</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
              Toplu SMS, API erişimi, kampanya yönetimi, raporlama ve provider entegrasyonları için güvenli iletişim merkezi.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo-request" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-950/30 transition-colors hover:bg-blue-500">Demo Talep Et <span className="ml-2">→</span></Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/15">Giriş Yap</Link>
            </div>
            <div className="mt-12 grid max-w-2xl gap-4 border-t border-white/15 pt-6 sm:grid-cols-3">
              {["Firma bazlı erişim", "Provider görünürlüğü", "Operasyon kontrolü"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-slate-200"><span className="text-emerald-300">✓</span>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-slate-200 bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-700">Tek merkez, net operasyon</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950 sm:text-4xl">Kurumsal iletişimin ihtiyaç duyduğu temel yetenekler</h2>
            <p className="mt-4 leading-7 text-slate-600">Günlük operasyonu sadeleştiren, büyüdükçe kontrolü koruyan modüler bir iletişim platformu.</p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
            {features.map(([title, description, icon]) => (
              <article key={title} className="bg-white p-7">
                <FeatureIcon name={icon} />
                <h3 className="mt-6 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="guvenlik" className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold text-blue-700">Güvenli ve kontrollü</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950 sm:text-4xl">Her firmanın verisi ve provider bağlantısı ayrıştırılır.</h2>
            <p className="mt-5 max-w-xl leading-7 text-slate-600">Rol tabanlı erişim, firma bazlı provider ayarları ve teslimat görünürlüğü ile kritik iletişim operasyonları kontrol altında tutulur.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Rol Tabanlı Erişim", "Owner, admin ve kullanıcı yetkileri firma seviyesinde yönetilir."],
              ["Secret Güvenliği", "Provider bilgileri kullanıcı ekranlarından ve API yanıtlarından korunur."],
              ["Teslimat Görünürlüğü", "Provider ve DLR alanları operasyon ekipleri için izlenebilir."],
              ["Davet Tabanlı Beta", "Yeni hesaplar firma doğrulaması ve yönetici onayıyla açılır."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="iletisim" className="bg-[#071426] py-16 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:px-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold">MSGNEX kontrollü beta programına katılın.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Firma ihtiyaçlarınızı değerlendirelim, doğru onboarding ve provider bağlantı sürecini birlikte planlayalım.</p>
          </div>
          <Link href="/demo-request" className="shrink-0 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500">Demo Talep Et</Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}
function FeatureIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    send: <><path d="M4 12 20 4l-6 16-3-7z" /><path d="m11 13 4-4" /></>,
    api: <><path d="M8 9 4 12l4 3" /><path d="m16 9 4 3-4 3" /><path d="m14 5-4 14" /></>,
    chart: <><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></>,
    contacts: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    campaign: <><path d="M5 8h14M5 12h10M5 16h7" /><path d="M4 4h16v16H4z" /></>,
    company: <><path d="M4 21V5h10v16M14 9h6v12M8 9h2M8 13h2M8 17h2" /></>,
    shield: <><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  }
  return <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{paths[name]}</svg></span>
}

function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-[#071426] text-slate-300">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div><div className="inline-flex rounded-lg bg-white px-3 py-2"><BrandLogo size="sm" className="max-w-[150px]" /></div><p className="mt-3 text-xs text-slate-400">Kurumsal SMS ve iletişim platformu.</p></div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <a href="#platform" className="hover:text-white">Hakkımızda</a>
          <a href="#iletisim" className="hover:text-white">İletişim</a>
          <Link href="/privacy" className="hover:text-white">Gizlilik Politikası</Link>
          <Link href="/kvkk" className="hover:text-white">KVKK</Link>
          <Link href="/terms" className="hover:text-white">Kullanım Şartları</Link>
        </nav>
      </div>
    </footer>
  )
}
