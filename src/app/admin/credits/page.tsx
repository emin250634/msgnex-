import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"

export default function CreditsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Eski Havuz Yönetimi Devre Dışı"
        description="MSGNEX artık SMS satışı veya merkezi SMS havuzu yönetimi yapmaz."
      />

      <Card title="BYO Provider Modeli">
        <div className="space-y-4 text-sm leading-6 text-gray-600">
          <p>
            Firmalar SMS paketlerini Netgsm gibi yetkili provider hesaplarından kendi adlarına alır.
            MSGNEX yalnızca firmanın onaylı provider API bilgileriyle operasyon paneli sağlar.
          </p>
          <p>
            Yeni kurulumlarda firma detay sayfasından Netgsm provider bağlantısını yapılandırın.
            Eski finansal tablolar geçmiş veri olarak korunur, fakat yeni merkezi havuz veya aktarım yapılmaz.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/companies">
            <Button>Firma Yönetimine Git</Button>
          </Link>
          <Link href="/admin/demo-requests">
            <Button variant="secondary">Demo Taleplerini Aç</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
