import Link from "next/link"
import { BrandLogo } from "@/components/ui/brand-logo"

const capabilities = [
  ["SMS API", "Uygulamalarınızı güvenli ve izlenebilir SMS API ile bağlayın.", "api"],
  ["Toplu SMS", "Segmentlerinize kontrollü toplu gönderimler hazırlayın.", "send"],
  ["Kampanyalar", "Kampanya hazırlama, onay ve gönderim süreçlerini yönetin.", "campaign"],
  ["Raporlama", "Provider, DLR ve teslimat performansını tek merkezden izleyin.", "chart"],
]

const trustItems = [
  ["SMS API", "Sistemlerinize entegre"],
  ["Çoklu Firma Desteği", "Firma bazlı yönetim"],
  ["Güvenli Altyapı", "Rol ve veri izolasyonu"],
  ["Kampanya Yönetimi", "Kontrollü operasyon"],
]

const steps = [
  ["01", "Demo Talebi", "Firmanızın iletişim hacmini ve ihtiyaçlarını paylaşın."],
  ["02", "Firma Onayı", "Hesabınız doğrulama ve yönetici onayı sonrası hazırlanır."],
  ["03", "Provider Bağlantısı", "Firma hesabınıza ait provider bilgileri güvenle bağlanır."],
  ["04", "SMS Gönderimi", "Kampanyalarınızı hazırlayın, gönderin ve sonuçları izleyin."],
]

export default function Home() {
  return (
    <main className="overflow-hidden bg-white text-slate-950">
      <Navbar />

      <section className="relative min-h-[94vh] overflow-hidden bg-[#06152b] pt-24 text-white">
        <div className="absolute inset-0 bg-[url('/background.png')] bg-cover bg-[position:28%_center] opacity-20" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,21,43,0.98)_0%,rgba(6,21,43,0.93)_47%,rgba(6,21,43,0.72)_100%)]" />
        <div className="relative mx-auto grid min-h-[calc(94vh-6rem)] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(540px,1.18fr)] lg:gap-14 lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-300/10 px-3 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Kontrollü Beta Programı
            </div>
            <h1 className="mt-7 text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-[3.7rem]">
              Kurumsal SMS Operasyonlarınızı
              <span className="mt-2 block text-blue-300">Tek Platformdan Yönetin</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Toplu SMS, SMS API, rehber yönetimi, kampanya planlama ve raporlama işlemlerini tek panelden yönetin.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo-request" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-7 py-4 text-base font-semibold text-white shadow-xl shadow-blue-950/40 transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-2xl">
                Demo Talep Et
                <span className="ml-2" aria-hidden="true">→</span>
              </Link>
              <a href="#platform" className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/10">
                Platformu İncele
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-4 border-t border-white/15 pt-7 text-sm font-medium text-slate-200">
              {["Firma bazlı veri izolasyonu", "Şifrelenmiş provider secret", "Rol tabanlı erişim"].map((item) => (
                <span key={item} className="flex items-center gap-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-400/10 text-xs text-emerald-300">✓</span>{item}</span>
              ))}
            </div>
          </div>

          <DashboardMockup />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 pb-10 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trustItems.map(([title, description], index) => (
              <div key={title} className="flex min-h-24 items-center gap-4 rounded-lg border border-white/10 bg-white/[0.08] px-5 py-4 shadow-lg shadow-black/10 backdrop-blur-xl transition-all hover:-translate-y-1 hover:bg-white/[0.12]">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-400/15 text-blue-200">
                  <FeatureIcon name={["api", "company", "shield", "campaign"][index]} />
                </span>
                <div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-0.5 text-xs text-slate-400">{description}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ozellikler" className="border-b border-slate-200 bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow="Platform yetenekleri" title="SMS operasyonunun tamamı tek çalışma alanında" description="Dağınık araçlar yerine ekiplerin tekrar tekrar kullanabileceği sade, güvenli ve ölçülebilir operasyon akışı." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(([title, description, icon]) => (
              <article key={title} className="flex min-h-64 flex-col bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FeatureIcon name={icon} /></span>
                <h3 className="mt-6 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow="Nasıl çalışır?" title="İlk talepten güvenli gönderime kadar kontrollü süreç" description="Firma hesabınız ve provider bağlantınız doğrulandıktan sonra ekibiniz operasyon panelini kullanmaya başlar." />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(([number, title, description]) => (
              <article key={number} className="relative border-t-2 border-blue-600 pt-6">
                <p className="text-sm font-semibold text-blue-700">{number}</p>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="guvenlik" className="border-y border-slate-200 bg-[#f5f8fc] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-blue-700">Güvenlik temelden başlar</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">Firma erişimi, provider bilgileri ve operasyon yetkileri ayrıştırılır.</h2>
            <p className="mt-5 max-w-xl leading-7 text-slate-600">Kritik SMS operasyonları için kullanıcı rolleri, firma sınırları ve provider kimlik bilgileri ayrı güvenlik katmanlarıyla yönetilir.</p>
            <Link href="/demo-request" className="mt-7 inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-800">Güvenli onboarding başlatın <span className="ml-2">→</span></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["company", "Firma Bazlı İzolasyon", "Her kullanıcı yalnızca kabul edilmiş ve aktif firma üyeliklerine erişir."],
              ["shield", "Şifrelenmiş Secret", "Provider şifreleri kullanıcı ekranlarında ve API yanıtlarında gösterilmez."],
              ["contacts", "Rol Bazlı Erişim", "Owner, admin ve kullanıcı yetkileri operasyon seviyesinde ayrıştırılır."],
            ].map(([icon, title, description]) => (
              <article key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white"><FeatureIcon name={icon} /></span>
                <h3 className="mt-6 font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="iletisim" className="bg-[#071426] py-16 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:px-8 lg:flex-row lg:items-center">
          <div><p className="text-sm font-semibold text-blue-300">Kontrollü beta programı</p><h2 className="mt-2 text-3xl font-semibold">SMS operasyonunuzu MSGNEX ile planlayın.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">İhtiyaçlarınızı değerlendirelim, firma onboarding ve provider bağlantı sürecini birlikte hazırlayalım.</p></div>
          <Link href="/demo-request" className="shrink-0 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500">Demo Talep Et</Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="MSGNEX ana sayfa" className="flex items-center"><BrandLogo size="md" className="h-14 max-w-[220px]" /></Link>
        <nav className="hidden items-center gap-10 text-lg font-semibold text-slate-800 lg:flex">
          <a href="#ozellikler" className="relative py-3 transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:bg-blue-600 after:transition-transform hover:text-blue-700 hover:after:scale-x-100">Özellikler</a>
          <a href="#platform" className="relative py-3 transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:bg-blue-600 after:transition-transform hover:text-blue-700 hover:after:scale-x-100">Platform</a>
          <a href="#guvenlik" className="relative py-3 transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:bg-blue-600 after:transition-transform hover:text-blue-700 hover:after:scale-x-100">Güvenlik</a>
          <a href="#iletisim" className="relative py-3 transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:bg-blue-600 after:transition-transform hover:text-blue-700 hover:after:scale-x-100">İletişim</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 sm:px-5 sm:text-base">Giriş Yap</Link>
          <Link href="/demo-request" className="hidden rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl sm:inline-flex">Demo Talep Et <span className="ml-2">→</span></Link>
        </div>
      </div>
    </header>
  )
}

function DashboardMockup() {
  return (
    <div className="landing-float relative mx-auto w-full max-w-[740px] lg:mx-0">
      <div className="absolute -inset-8 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.35),transparent_68%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-xl border border-white/15 bg-[#0b1d39]/95 p-2 shadow-2xl shadow-black/40 lg:rotate-[1.5deg]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400/80" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" /></div>
          <span className="text-[10px] font-medium text-slate-400">MSGNEX Operasyon Merkezi</span>
          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold text-emerald-300">Sistem Aktif</span>
        </div>
        <div className="grid min-h-[430px] grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)]">
          <aside className="border-r border-white/10 p-3">
            <div className="mb-5 hidden rounded-md bg-white px-2 py-2 sm:block"><BrandLogo size="sm" className="h-5 max-w-[105px]" /></div>
            <div className="space-y-2">
              {["Genel Bakış", "SMS Gönder", "Kampanyalar", "Raporlama", "Kişiler"].map((item, index) => (
                <div key={item} className={`flex h-9 items-center gap-2 rounded-md px-2 ${index === 0 ? "bg-blue-600 text-white" : "text-slate-400"}`}>
                  <span className={`h-2 w-2 rounded-sm ${index === 0 ? "bg-white" : "bg-slate-600"}`} /><span className="hidden truncate text-[10px] font-medium sm:block">{item}</span>
                </div>
              ))}
            </div>
          </aside>
          <div className="min-w-0 bg-[#f6f8fc] p-4 text-slate-950 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-semibold text-blue-700">OPERASYON ÖZETİ</p><p className="mt-1 text-base font-semibold">Genel Bakış</p></div><span className="rounded-md bg-blue-600 px-3 py-2 text-[9px] font-semibold text-white">SMS Gönder</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[["Gönderim", "24.860", "blue"], ["İletildi", "%96,8", "green"], ["Kampanya", "18", "navy"], ["Provider", "Netgsm", "amber"]].map(([label, value, tone]) => (
                <div key={label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"><span className={`block h-1.5 w-6 rounded-full ${tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "navy" ? "bg-slate-800" : "bg-blue-600"}`} /><p className="mt-3 text-[9px] text-slate-500">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(150px,0.55fr)]">
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold">SMS Gönderim Performansı</p><p className="mt-1 text-[8px] text-slate-400">Son 7 gün</p></div><span className="text-[8px] font-semibold text-emerald-600">+18,4%</span></div>
                <div className="mt-5 flex h-32 items-end gap-2 border-b border-slate-100 px-1">
                  {[38, 62, 49, 78, 58, 88, 72, 96, 81, 108, 92, 118].map((height, index) => <span key={index} className="w-full rounded-t-sm bg-blue-500" style={{ height }} />)}
                </div>
                <div className="mt-2 flex justify-between text-[7px] text-slate-400"><span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span></div>
              </div>
              <div className="rounded-md bg-[#0a1b35] p-4 text-white shadow-sm"><p className="text-[9px] font-semibold text-blue-200">Başarı Oranı</p><div className="mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-blue-500 border-r-blue-200/20"><div className="text-center"><p className="text-xl font-semibold">%96,8</p><p className="text-[7px] text-slate-400">iletim</p></div></div><div className="mt-5 flex items-center justify-between text-[8px]"><span className="text-slate-400">DLR bekleyen</span><span className="font-semibold text-amber-300">126</span></div></div>
            </div>
            <div className="mt-3 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold">Son Kampanya</p><p className="mt-1 text-[8px] text-slate-400">Yaz dönemi müşteri iletişimi</p></div><div className="flex items-center gap-4 text-right"><div><p className="text-[7px] text-slate-400">Alıcı</p><p className="text-[9px] font-semibold">2.480</p></div><div><p className="text-[7px] text-slate-400">Durum</p><p className="text-[9px] font-semibold text-emerald-600">Tamamlandı</p></div></div></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="max-w-2xl"><p className="text-sm font-semibold text-blue-700">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">{title}</h2><p className="mt-4 leading-7 text-slate-600">{description}</p></div>
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
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{paths[name]}</svg>
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.35fr_repeat(4,minmax(0,0.65fr))]">
        <div className="lg:border-r lg:border-slate-200 lg:pr-10">
          <BrandLogo size="lg" className="h-auto w-[240px] max-w-full" />
          <p className="mt-5 max-w-sm text-sm leading-7 text-slate-600">Kurumsal SMS ve iletişim operasyonlarını güvenli, ölçülebilir ve kontrollü biçimde tek panelden yönetin.</p>
        </div>
        <FooterColumn title="Platform" links={[["Özellikler", "#ozellikler"], ["SMS API", "#ozellikler"], ["Kampanyalar", "#platform"], ["Raporlama", "#ozellikler"]]} />
        <FooterColumn title="Kurumsal" links={[["Güvenlik", "#guvenlik"], ["KVKK", "/kvkk"], ["Gizlilik Politikası", "/privacy"], ["Kullanım Şartları", "/terms"]]} />
        <FooterColumn title="Destek" links={[["İletişim", "#iletisim"], ["Demo Talep Et", "/demo-request"], ["Giriş Yap", "/login"]]} />
        <FooterColumn title="Hakkımızda" links={[["MSGNEX Hakkında", "#platform"], ["Beta Programı", "/demo-request"], ["Güvenli Altyapı", "#guvenlik"]]} />
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-sm text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>© 2026 MSGNEX. Tüm hakları saklıdır.</p>
          <p>Kurumsal SMS ve İletişim Platformu</p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase text-slate-950">{title}</h3>
      <nav className="mt-5 space-y-3 text-sm">
        {links.map(([label, href]) => href.startsWith("/") ? <Link key={label} href={href} className="block transition-colors hover:text-blue-700">{label}</Link> : <a key={label} href={href} className="block transition-colors hover:text-blue-700">{label}</a>)}
      </nav>
    </div>
  )
}
