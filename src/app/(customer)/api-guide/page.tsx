"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"

const endpoint = "/api/v1/external/messages"

export default function ApiGuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="API Geliştirici Rehberi"
        description="Dış sistemlerden MSGNEX üzerinden güvenli işlemsel SMS göndermek için entegrasyon notları."
        actions={<Link href="/api-keys"><Button variant="secondary">API Anahtarları</Button></Link>}
      />

      <Card title="Temel Kurallar">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DocItem label="Endpoint" value={`POST ${endpoint}`} />
          <DocItem label="Kimlik Doğrulama" value="Authorization: Bearer API_ANAHTARI" />
          <DocItem label="Tekrar Koruması" value="Idempotency-Key zorunlu" />
          <DocItem label="Alıcı Limiti" value="Tek istekte en fazla 1000 alıcı" />
        </div>
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          API gönderimleri firmanızın bağlı Netgsm provider hesabı ve onaylı gönderici başlığı üzerinden yapılır. MSGNEX SMS kredisi satmaz; sağlayıcı bakiyesi firmanızın kendi hesabından kullanılır.
        </div>
      </Card>

      <Card title="Plan ve Kullanım Limitleri">
        <div className="grid gap-3 md:grid-cols-3">
          <RuleBox title="Başlangıç" text="API erişimi kapalıdır. API anahtarı oluşturmak için Profesyonel veya Ajans planı gerekir." />
          <RuleBox title="Profesyonel" text="Standart entegrasyon kullanımı için dakikada 60 istek ve günde 10.000 istek limiti uygulanır." />
          <RuleBox title="Ajans / Kurumsal" text="Yüksek hacimli entegrasyonlar için dakikada 300 istek ve günde 100.000 istek limiti uygulanır." />
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Limit aşımında API `429` döndürür ve `Retry-After` header bilgisini gönderir. Entegrasyon tarafında retry/backoff ve idempotency mantığını bu değerlere göre tasarlayın.
        </div>
      </Card>

      <Card title="Entegrasyon Öncesi Kontrol">
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <ChecklistItem text="Profesyonel veya Ajans planında API erişimi açık olmalı." />
          <ChecklistItem text="Provider bağlantısı aktif olmalı." />
          <ChecklistItem text="Onaylı gönderici başlığı tanımlanmış olmalı." />
          <ChecklistItem text="Sağlayıcı hesabında yeterli SMS bakiyesi bulunmalı." />
          <ChecklistItem text="Her istekte benzersiz Idempotency-Key gönderilmeli." />
          <ChecklistItem text="Alıcılar Türkiye cep telefonu formatına normalize edilebilir olmalı." />
        </div>
      </Card>

      <Card title="Request">
        <div className="grid gap-4 lg:grid-cols-2">
          <CodeBlock title="Headers" code={`Authorization: Bearer API_ANAHTARINIZ
Idempotency-Key: crm-order-12345
Content-Type: application/json`} />
          <CodeBlock title="Body" code={`{
  "recipients": ["905551112233", "05554443322"],
  "message": "Siparişiniz hazır."
}`} />
        </div>
      </Card>

      <Card title="Kod Örnekleri">
        <div className="grid gap-4 xl:grid-cols-3">
          <CodeBlock title="cURL" code={`curl -X POST https://app.msgnex.com${endpoint} \\
  -H "Authorization: Bearer API_ANAHTARINIZ" \\
  -H "Idempotency-Key: crm-order-12345" \\
  -H "Content-Type: application/json" \\
  -d '{"recipients":["905551112233"],"message":"Siparişiniz hazır."}'`} />
          <CodeBlock title="JavaScript fetch" code={`await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer API_ANAHTARINIZ",
    "Idempotency-Key": "crm-order-12345",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    recipients: ["905551112233"],
    message: "Siparişiniz hazır."
  })
})`} />
          <CodeBlock title="PHP cURL" code={`$payload = json_encode([
  "recipients" => ["905551112233"],
  "message" => "Siparişiniz hazır."
]);

$ch = curl_init("https://app.msgnex.com${endpoint}");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer API_ANAHTARINIZ",
    "Idempotency-Key: crm-order-12345",
    "Content-Type: application/json"
  ],
  CURLOPT_POSTFIELDS => $payload,
  CURLOPT_RETURNTRANSFER => true
]);

$response = curl_exec($ch);`} />
        </div>
      </Card>

      <Card title="Response">
        <div className="grid gap-4 lg:grid-cols-2">
          <CodeBlock title="Başarılı Yanıt" code={`{
  "campaignId": "uuid",
  "success": 2,
  "fail": 0,
  "pending": 2,
  "provider": "netgsm",
  "providerBulkId": "123456",
  "estimatedProviderUnits": 2,
  "skippedRecipients": 0
}`} />
          <div className="space-y-3">
            <StatusRow code="401" text="Authorization veya Idempotency-Key eksik." />
            <StatusRow code="400" text="Alıcı, mesaj, provider hazırlığı veya plan limiti geçersiz." />
            <StatusRow code="409" text="Aynı Idempotency-Key ile istek halen işleniyor." />
            <StatusRow code="429" text="Plan bazlı API oran limiti aşıldı. Retry-After header'ına göre tekrar deneyin." />
            <StatusRow code="500" text="Gönderim sonucu kaydedilemedi veya API ayarları eksik." />
          </div>
        </div>
      </Card>

      <Card title="İdempotency Kullanımı">
        <div className="space-y-3 text-sm leading-6 text-gray-700">
          <p>Aynı işleme ait tekrar denemelerde aynı `Idempotency-Key` kullanılmalıdır. Örneğin sipariş ID, randevu ID veya fatura ID gibi sisteminizde tekil olan bir değer tercih edin.</p>
          <p>İlk istek tamamlandıysa aynı anahtarla gelen tekrar isteği mevcut sonucu döndürür. İlk istek hâlâ işleniyorsa API `409` döndürür.</p>
        </div>
      </Card>

      <Card title="Telefon ve Mesaj Kuralları">
        <div className="grid gap-3 md:grid-cols-2">
          <RuleBox title="Telefon Formatı" text="API 10 haneli, 0 ile başlayan veya 90 ülke kodlu Türkiye numaralarını normalize eder. Geçersiz kayıtlar reddedilir." />
          <RuleBox title="Mesaj Uzunluğu" text="Mesaj boş olamaz ve sistemin maksimum SMS metni sınırını aşamaz." />
          <RuleBox title="Başlık" text="Başlık API request içinde gönderilmez; firmanızın onaylı provider başlığı kullanılır." />
          <RuleBox title="Kara Liste" text="Kara listedeki numaralar gönderim hazırlığında atlanır ve kampanya raporunda görünür." />
        </div>
      </Card>

      <Card title="Webhook ile Sonuç Takibi">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm leading-6 text-gray-700">
            API ile oluşturulan kampanyaların sonuçlarını dış sisteminize aktarmak için webhook eventlerini kullanabilirsiniz.
          </div>
          <Link href="/webhooks"><Button variant="secondary">Webhook Ayarları</Button></Link>
        </div>
      </Card>
    </div>
  )
}

function DocItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-gray-950">{value}</p>
    </div>
  )
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
      <span className="font-semibold">OK</span> {text}
    </div>
  )
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-950">{title}</p>
      <pre className="max-h-96 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
        {code}
      </pre>
    </div>
  )
}

function StatusRow({ code, text }: { code: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <StatusBadge label={code} tone={code === "500" ? "danger" : code === "409" ? "warning" : "neutral"} />
      <p className="text-sm leading-6 text-gray-700">{text}</p>
    </div>
  )
}

function RuleBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-semibold text-gray-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
    </div>
  )
}
