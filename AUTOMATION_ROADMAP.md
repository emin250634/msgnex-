# MSGNEX Otomasyon Yol Haritası

## Mevcut Durum

Otomasyon modülü şu anda bilinçli olarak hazırlık modunda tutuluyor. `automations`, `automation-queue` ve `automation-history` sayfaları kullanıcıya gerçek backend olmadığını açıkça söylüyor; sahte otomasyon kaydı veya sahte gönderim geçmişi göstermiyor.

Doğum günü altyapısı için önemli temel hazır:

- `contacts.birth_date` alanı mevcut.
- CSV import doğum tarihi eşlemesini destekliyor.
- Kişiler ve segmentler ekranında doğum günü yaklaşan kişi filtreleri var.
- SMS gönderimi için güvenli yol mevcut: `/api/v1/messages` -> `queue_sms_campaign` RPC -> worker -> provider.
- Suppression list ve izin durumu SMS hazırlama ekranında dikkate alınıyor.
- Provider başlığı manuel yazılmıyor; aktif provider ayarından geliyor.

Eksik olan kısım gerçek otomasyon backend'i:

- Otomasyon kuralı tablosu yok.
- Otomasyon çalışma geçmişi tablosu yok.
- Otomasyon adayı/kuyruğu tablosu yok.
- Günlük otomasyon worker/RPC yok.
- Şablon değişkenlerini kişiye göre render eden merkezi servis yok.

## Ürün Hedefi

İlk sürümün hedefi sadece doğum günü otomasyonu olmalı:

> Firma, doğum tarihi kayıtlı ve gönderim izni uygun kişilere otomatik doğum günü SMS'i hazırlayabilsin.

Bu özellik ilk canlı sürümde doğrudan provider'a SMS basmamalı. Otomasyon mevcut kampanya kuyruğu mantığını kullanmalı veya manuel onay kuyruğundan geçmeli. Böylece duplicate SMS, izinsiz gönderim ve hatalı provider çağrısı riski düşük kalır.

## MVP Kapsamı

İlk sürümde yapılacaklar:

- Doğum günü otomasyon kuralı oluşturma.
- Tüm kişiler veya seçili grup hedefleme.
- SMS şablonu veya özel mesaj metni.
- `{{ad}}`, `{{soyad}}`, `{{firma}}`, `{{telefon}}`, `{{dogum_gunu}}` değişkenleri.
- Gönderim günü seçimi: aynı gün, 1 gün önce, 7 gün önce.
- Gönderim saati.
- Aktif/pasif durumu.
- Suppression ve `opted_out` kontrolü.
- Aynı kişiye aynı otomasyon için aynı tarih içinde ikinci aday/gönderim üretmeme.
- Çalışma geçmişi ve hata kaydı.
- İlk sürümde manuel onaylı gönderim modu.

İlk sürüme alınmayacaklar:

- Çok adımlı görsel otomasyon akışı.
- E-posta/WhatsApp gibi SMS dışı kanal.
- Karmaşık koşul motoru.
- Sınırsız custom field tabanlı otomasyon.
- Otomatik resend/refund mantığı.

## Önerilen Veritabanı Modeli

### `automation_rules`

Otomasyon kuralını tutar.

Önerilen alanlar:

- `id uuid primary key`
- `company_id uuid not null`
- `name text not null`
- `type text not null` -> ilk sürümde sadece `birthday`
- `status text not null` -> `active`, `inactive`
- `target_group_id uuid null`
- `template_id uuid null`
- `message text not null`
- `send_time time not null`
- `timezone text not null default 'Europe/Istanbul'`
- `day_offset integer not null default 0`
- `requires_approval boolean not null default true`
- `last_run_on date null`
- `created_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraint önerileri:

- `type in ('birthday')`
- `status in ('active', 'inactive')`
- `day_offset in (0, 1, 7)`
- mesaj uzunluğu `1..612`

### `automation_runs`

Her çalışma denemesini kaydeder.

Önerilen alanlar:

- `id uuid primary key`
- `company_id uuid not null`
- `automation_rule_id uuid not null`
- `run_date date not null`
- `status text not null` -> `running`, `completed`, `failed`, `review_required`
- `matched_count integer not null default 0`
- `candidate_count integer not null default 0`
- `queued_campaign_id uuid null`
- `error_code text null`
- `error_message text null`
- `started_at timestamptz not null default now()`
- `completed_at timestamptz null`

Unique önerisi:

- `(automation_rule_id, run_date)` unique.

Bu unique constraint worker tekrar çalışırsa aynı gün aynı kuralı ikinci kez üretmeyi engeller.

### `automation_candidates`

Manuel onay kuyruğu için aday kayıtları.

Önerilen alanlar:

- `id uuid primary key`
- `company_id uuid not null`
- `automation_rule_id uuid not null`
- `automation_run_id uuid not null`
- `contact_id uuid not null`
- `phone text not null`
- `message text not null`
- `scheduled_for timestamptz not null`
- `status text not null` -> `pending`, `approved`, `rejected`, `queued`, `skipped`
- `skip_reason text null`
- `campaign_id uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique önerisi:

- `(automation_rule_id, contact_id, scheduled_for::date)` benzeri bir duplicate koruması gerekir.
- Expression unique index migration içinde dikkatli tasarlanmalı.

## RLS ve Yetki Modeli

Tüm otomasyon tabloları firma bazlı izole edilmeli.

Müşteri tarafı:

- `company_owner` ve `company_admin`: otomasyon oluşturma, düzenleme, aktif/pasif yapma, aday onaylama.
- `company_user`: ilk sürümde sadece görüntüleme veya tamamen kapalı olabilir.

Worker tarafı:

- Otomasyon çalıştırma RPC'leri sadece `service_role` ile çağrılmalı.
- `SECURITY DEFINER` fonksiyonlarda `SET search_path = ''` kullanılmalı.
- `PUBLIC`, `anon`, `authenticated` execute kapalı olmalı.

## Worker Akışı

Önerilen güvenli akış:

1. Worker endpoint `WORKER_SECRET` ile çağrılır.
2. `claim_due_automation_rules(...)` RPC aktif ve zamanı gelen kuralları claim eder.
3. Her kural için ilgili kişileri bulur:
   - `birth_date is not null`
   - gün/ay eşleşmesi offset'e göre hesaplanır
   - hedef grup varsa `group_id = target_group_id`
   - `consent_status != 'opted_out'`
   - suppression list içinde değil
4. Her kişi için değişkenli mesaj render edilir.
5. Duplicate aday kontrolü yapılır.
6. İlk sürümde adaylar `automation_candidates.status = pending` olarak yazılır.
7. Kullanıcı onayladığında mevcut `queue_sms_campaign` benzeri güvenli akıştan kampanya oluşturulur.
8. Run kaydı tamamlanır ve audit log yazılır.

İlk sürümde otomatik provider gönderimi önerilmez. Manuel onay kuyruğu daha güvenli ve satış/pilot aşamasına daha uygundur.

## Şablon Değişkenleri

Merkezi bir server/client-safe helper önerilir:

- `src/lib/message-template.ts`

Önerilen fonksiyonlar:

- `extractTemplateVariables(message)`
- `renderContactMessage(message, contact, company)`
- `validateSupportedVariables(message)`

İlk desteklenecek değişkenler:

- `{{ad}}`
- `{{soyad}}`
- `{{firma}}`
- `{{telefon}}`
- `{{dogum_gunu}}`

Render sonrası SMS segment hesabı gerçek mesaj üzerinden yapılmalı.

## UI Planı

### Otomasyonlar

`/automations` artık gerçek kayıtları listeler:

- Ad
- Tür
- Hedef
- Durum
- Son çalışma
- Bekleyen aday
- Aktif/pasif

### Yeni Otomasyon

`/automations/new` ilk sürümde sade form olmalı:

- Otomasyon adı
- Tür: Doğum günü
- Hedef: tüm kişiler veya grup
- Şablon seçimi veya mesaj alanı
- Gönderim zamanı
- Gün offset
- Manuel onay zorunlu
- Aktif/pasif
- Önizleme

### Otomasyon Kuyruğu

`/automation-queue` pending adayları gösterir:

- Kişi
- Telefon
- Mesaj önizleme
- Planlanan tarih
- Onayla
- Reddet
- Kampanyaya aktar

### Otomasyon Geçmişi

`/automation-history` gerçek `automation_runs` kayıtlarını gösterir:

- Kural
- Çalışma tarihi
- Eşleşen kişi
- Aday sayısı
- Onaylanan/reddedilen
- Üretilen kampanya
- Hata

## API / RPC Planı

Önerilen RPC'ler:

- `create_automation_rule(...)`
- `update_automation_rule(...)`
- `set_automation_rule_status(...)`
- `claim_due_automation_rules(...)`
- `generate_automation_candidates(...)`
- `approve_automation_candidates(...)`
- `reject_automation_candidates(...)`
- `queue_approved_automation_candidates(...)`

Kampanya oluşturma tarafında iki seçenek var:

1. Mevcut `queue_sms_campaign(p_message, p_recipients)` kullanılır.
   - Basit ama kişiye özel mesaj değişkenleri için yetersizdir.

2. Yeni `queue_sms_campaign_messages(p_name, p_messages jsonb)` RPC eklenir.
   - Her alıcıya farklı render edilmiş mesaj gönderebilir.
   - Doğum günü mesajlarında `{{ad}}` gibi değişkenler için daha doğru yoldur.

Öneri: Doğum günü MVP için ikinci seçenek daha sağlamdır.

## Test Planı

Unit testler:

- Şablon değişken çıkarma.
- Kişiye özel mesaj render.
- Unsupported variable validation.
- Doğum günü tarih eşleşmesi.
- Leap year / 29 Şubat davranışı.
- Duplicate candidate prevention helper.
- Suppression ve opted_out filtreleme helper'ları.

DB / staging testleri:

- Tenant A/B otomasyon RLS izolasyonu.
- Aynı automation/date için duplicate run engeli.
- Aynı contact/date için duplicate candidate engeli.
- `service_role` dışından worker RPC çalışmaması.
- Onaylanan adayların kampanya kuyruğuna doğru aktarılması.
- Suppressed ve opted_out kişilerin aday olmaması.

## Riskler

- Kişiye özel mesajlar mevcut `queue_sms_campaign` ile tek mesaj olarak yönetilemiyor.
- Otomatik gönderim açılırsa yanlış şablon veya tarih hatası toplu SMS üretebilir.
- Doğum günü hesaplamasında timezone ve 29 Şubat davranışı net tanımlanmalı.
- `unknown` izin durumu için ürün politikası netleşmeli: ilk sürümde izin belirsiz kişilere otomasyon göndermemek daha güvenli olabilir.
- Production migration geçmişi SQL Editor kaynaklı olduğu için otomasyon migration'ları staging'de doğrulanmadan production'a uygulanmamalı.

## Önerilen Fazlar

### Faz 1 - Template Helper ve Plan

- `src/lib/message-template.ts`
- Unit testler
- UI'da sadece önizleme için kullanılabilir hale getirme

### Faz 2 - Automation Schema

- `00052_automation_rules.sql`
- RLS, indexes, constraints
- Types güncellemesi

### Faz 3 - Automation CRUD

- Liste ve yeni otomasyon ekranını gerçek backend'e bağlama
- Aktif/pasif aksiyonları

### Faz 4 - Candidate Generation

- Birthday matching RPC/helper
- `automation_runs`
- `automation_candidates`
- Worker endpoint entegrasyonu

### Faz 5 - Manual Approval Queue

- Kuyruk ekranını gerçek adaylara bağlama
- Onayla/reddet
- Onaylı adayları kampanyaya aktarma

### Faz 6 - Staging Verification

- Disposable staging project
- RLS testleri
- Duplicate testleri
- Gerçek SMS göndermeden TEST/disposable provider doğrulaması

### Faz 7 - Production Rollout

- Önce manuel onay moduyla beta
- İlk müşteride küçük grup ile test
- Audit log ve run kayıtları izleme
- Otomatik gönderim daha sonra ayrıca değerlendirme

## İlk Uygulama Önerisi

Bir sonraki teknik adım olarak Faz 1 yapılmalı:

- Mesaj değişken helper'ı ekle.
- Doğum günü tarih eşleşmesi helper'ı ekle.
- Vitest testlerini ekle.
- Hiçbir DB migration yapmadan önce temel iş mantığını güvenceye al.

Bu, düşük riskli ve sonraki migration/worker fazları için sağlam temel oluşturur.
