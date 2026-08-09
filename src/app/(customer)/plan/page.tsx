import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"

const plans = [
  {
    name: "Başlangıç",
    audience: "Küçük işletmeler",
    description: "Temel CRM ve manuel SMS kampanyaları için sade kullanım.",
    features: [
      "Kişi ve grup yönetimi",
      "Manuel SMS kampanyası",
      "Kara liste yönetimi",
      "Temel kampanya raporu",
      "Provider bağlantı durumu",
    ],
    highlighted: false,
  },
  {
    name: "Profesyonel",
    audience: "Büyüyen ekipler",
    description: "Raporlama, izin yönetimi ve API entegrasyonu ile operasyonel kullanım.",
    features: [
      "CSV import sihirbazı",
      "İzinli iletişim takibi",
      "Gelişmiş kampanya raporu",
      "API anahtarları ve dokümantasyon",
      "Audit log görünümü",
    ],
    highlighted: true,
  },
  {
    name: "Ajans / Kurumsal",
    audience: "Çoklu operasyonlar",
    description: "Birden fazla firma veya yüksek hacimli entegrasyon yönetimi için.",
    features: [
      "Çoklu firma operasyonu",
      "Gelişmiş yetki yönetimi",
      "Webhook hazırlığı",
      "Özel onboarding",
      "Öncelikli destek",
    ],
    highlighted: false,
  },
]

const comparisonRows = [
  ["SMS kredisi", "Sağlayıcı hesabınızdan", "Sağlayıcı hesabınızdan", "Sağlayıcı hesabınızdan"],
  ["Onaylı başlık kontrolü", "Var", "Var", "Var"],
  ["Kara liste", "Var", "Var", "Var"],
  ["İzin yönetimi", "Temel", "Gelişmiş", "Gelişmiş"],
  ["API", "-", "Var", "Var"],
  ["Audit log", "-", "Var", "Var"],
  ["Webhook", "-", "Hazırlık", "Planlanıyor"],
]

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Planım ve Paketler"
        description="MSGNEX yazılım kullanım paketlerini karşılaştırın. SMS kredisi paketlere dahil değildir; gönderimler firmanızın kendi sağlayıcı hesabından yapılır."
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <p className="font-semibold">MSGNEX SMS kredisi satmaz.</p>
        <p>Platform; provider bağlantısı, CRM, izin yönetimi, kampanya operasyonu, raporlama ve API katmanı sunar. Sağlayıcı bakiyesi ve başlık tanımı firmanızın kendi Netgsm hesabında yönetilir.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.highlighted ? "border-blue-300 shadow-lg shadow-blue-950/10" : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-blue-700">{plan.audience}</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">{plan.name}</h2>
              </div>
              {plan.highlighted && <StatusBadge label="Önerilen" tone="info" />}
            </div>
            <p className="mt-4 min-h-12 text-sm leading-6 text-gray-600">{plan.description}</p>
            <div className="mt-5 space-y-3">
              {plan.features.map((feature) => (
                <FeatureRow key={feature} text={feature} />
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Fiyatlandırma yazılım kullanım hakkı ve operasyonel özelliklere göre belirlenir.
            </div>
          </Card>
        ))}
      </div>

      <Card title="Paket Karşılaştırması">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-3 pr-4 font-semibold">Özellik</th>
                <th className="py-3 pr-4 font-semibold">Başlangıç</th>
                <th className="py-3 pr-4 font-semibold">Profesyonel</th>
                <th className="py-3 pr-4 font-semibold">Ajans / Kurumsal</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row[0]} className="border-b border-gray-100 last:border-0">
                  {row.map((cell, index) => (
                    <td key={`${row[0]}-${index}`} className={index === 0 ? "py-3 pr-4 font-semibold text-gray-950" : "py-3 pr-4 text-gray-700"}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Ticari Konumlandırma">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <ValueBox title="Güven" text="Onaylı başlık, kara liste ve izin yönetimi yanlış gönderim riskini azaltır." />
          <ValueBox title="Operasyon" text="Kişiler, segmentler, kampanyalar ve raporlar tek panelde yönetilir." />
          <ValueBox title="Entegrasyon" text="API anahtarları ile dış sistemlerden güvenli SMS gönderimi yapılabilir." />
        </div>
      </Card>
    </div>
  )
}

function FeatureRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
      <span>{text}</span>
    </div>
  )
}

function ValueBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="font-semibold text-gray-950">{title}</p>
      <p className="mt-2 leading-6 text-gray-600">{text}</p>
    </div>
  )
}
