# MSGNEX Ticari Seviye Yol Haritası

## Amaç

MSGNEX, firmaların kendi SMS sağlayıcı hesaplarını kullanarak müşteri verilerini yönetebildiği, toplu SMS kampanyaları oluşturabildiği, gönderim geçmişini izleyebildiği ve operasyonel süreçlerini tek panelden yürütebildiği bir iletişim yönetim platformu olmalıdır.

Platformun ticari konumu SMS kredisi satmak değildir. MSGNEX'in değeri; sağlayıcı hesabı, müşteri verisi, segmentasyon, kampanya operasyonu, raporlama, güvenlik ve ekip yönetimini bir araya getiren profesyonel iş katmanıdır.

## Müşteri Neden MSGNEX'i Seçmeli?

1. Kendi sağlayıcı hesabını kullanır.
   - Firma Netgsm gibi sağlayıcılardan aldığı kendi hesabını bağlar.
   - SMS bakiyesi ve başlık sorumluluğu sağlayıcı tarafında kalır.
   - MSGNEX arada kredi satmaz, hukuki riski azaltır.

2. Başlık güvenliği sağlar.
   - Firma panelde rastgele gönderici başlığı yazamaz.
   - Sadece sağlayıcıdan sorgulanmış ve onaylı başlıklar seçilebilir.
   - Marka taklidi ve yanlış başlık kullanımı engellenir.

3. Operasyon kolaylığı sunar.
   - Kişiler, gruplar, segmentler, şablonlar ve kampanyalar tek panelde yönetilir.
   - Manuel Excel/CSV karmaşası azalır.
   - Tekrarlayan gönderimler daha düzenli yürütülür.

4. Ölçülebilirlik ve takip sağlar.
   - Kampanya durumu, gönderim geçmişi, başarısız numaralar ve sağlayıcı sonuçları takip edilir.
   - Firma hangi mesajın kimlere gittiğini kayıt altında görür.

5. Ekip ve firma yönetimi sunar.
   - Firma sahibi, firma yöneticisi ve kullanıcı rolleri ayrılabilir.
   - Admin tarafında firma, kullanıcı ve provider ayarları merkezi yönetilir.

6. Kurumsal kullanıma uygun ilerler.
   - KVKK, izinli iletişim, kara liste, audit log ve güvenli provider bağlantısı üzerine büyüyebilir.
   - Küçük işletmeden ajans/muhasebe/klinik/e-ticaret seviyesine genişleyebilir.

## Temel Vaat

MSGNEX'in müşteriye ana vaadi:

> "SMS sağlayıcınızı değiştirmeden, müşteri iletişiminizi daha düzenli, güvenli, ölçülebilir ve ekipçe yönetilebilir hale getirin."

Destekleyici vaatler:

- Kredi satışı yok; firma kendi sağlayıcı hesabını kullanır.
- Onaylı başlık dışına çıkılmaz.
- Kişi ve segment yönetimi tek paneldedir.
- Gönderimler kayıt altındadır.
- Kara liste ve izin yönetimi ile risk azaltılır.
- API ile dış sistemlerden gönderim yapılabilir.
- Admin paneli ile firmalar merkezi yönetilir.

## Hedef Müşteri Profilleri

1. Yerel işletmeler
   - Restoran, kuaför, servis, klinik, oto galeri, kurs, spor salonu.
   - İhtiyaç: kampanya, randevu, hatırlatma, duyuru.

2. E-ticaret ve perakende firmaları
   - İhtiyaç: kampanya duyurusu, sipariş bilgilendirme, sadakat segmentleri.

3. Ajanslar
   - Birden fazla müşterinin SMS operasyonunu yönetmek isteyebilir.
   - İhtiyaç: çoklu firma, yetki, raporlama, şablon standardı.

4. Operasyonel ekipler
   - Tahsilat, servis, randevu, saha operasyonları.
   - İhtiyaç: düzenli liste yönetimi, gönderim geçmişi, başarısız gönderim takibi.

## Ürün Prensipleri

- MSGNEX SMS kredisi satmaz.
- Firma kendi sağlayıcı hesabını bağlar.
- Gönderici başlığı manuel yazılamaz.
- SMS gönderimi sadece aktif provider bağlantısı ile yapılır.
- Müşteri verisi firma bazlı izole edilir.
- Kritik işlemler kayıt altına alınır.
- Müşteri paneli sade, admin paneli güçlü olmalıdır.

## Faz 1 - Ticari Temel Sağlamlaştırma

Durum: Büyük kısmı tamamlandı.

Tamamlananlar:

- Kredi satışı yaklaşımından BYO provider modeline geçildi.
- Provider sayfası eklendi.
- Provider sayfası onboarding akışı ve hazırlık adımlarıyla güçlendirildi.
- Eski bakiye/kredi satın alma algısı azaltıldı.
- Admin provider bağlantı ayarları eklendi.
- Provider bağlantı testi, başlık sorgulama ve sağlayıcı kredi sorgulama aksiyonları eklendi.
- Onaylı başlık listesi migration ile eklendi.
- Başlık manuel girişten çıkarıldı, dropdown seçimine bağlandı.
- Firma ve kullanıcı kalıcı silme aksiyonları eklendi.

Kalanlar:

- Canlı Netgsm hesabıyla uçtan uca test.
- Production Supabase migration kontrolü.
- Hata mesajlarının kullanıcı seviyesinde sadeleştirilmesi.

## Faz 2 - Güven ve Uyumluluk

Amaç: Ticari müşterinin güven duymasını sağlayacak altyapıyı güçlendirmek.

Başlanan işler:

- Gönderim öncesi risk/özet ekranı güçlendirildi:
  - seçilen alıcı sayısı
  - gönderilecek net alıcı sayısı
  - kara listede atlanacak numara sayısı
  - kullanılacak provider başlığı
  - tahmini sağlayıcı kredi kullanımı
- Audit log altyapısı başlatıldı:
  - provider ayarı kaydetme
  - provider bağlantı/başlık/kredi sorguları
  - firma silme
  - kullanıcı silme
  - firma kullanıcı rol/aktiflik değişimi
  - firma kullanıcı üyeliği silme
- Kişi bazlı ticari ileti izni başlatıldı:
  - kişi kayıtlarında izinli/izinsiz/bilinmiyor durumu
  - manuel kişi ekleme izin seçimi
  - CSV import varsayılan izin seçimi
  - kişi listesinde izin durumu filtresi
  - izin değişikliği geçmişi
  - kişi detayında izin kanıtı/tarihçesi
  - SMS gönderim öncesi izinsiz kişi özeti
  - izinsiz kişilerin SMS payload'ından çıkarılması
- Kara liste yönetimi güçlendirildi:
  - arama
  - toplam/son eklenen istatistikleri
  - güvenli gönderim açıklaması
  - CSV format yönlendirmesi

Yapılacaklar:

- KVKK/izinli iletişim ekranlarını detaylandırmak.
- Kara liste/açık ret kayıtlarını raporlama tarafına bağlamak.
- İzin kanıtı dışa aktarma akışını geliştirmek.
- Kritik admin işlemleri kapsamını genişletmek.
- Provider secret değişimlerini maskelemek ve geçmişini göstermek.
- Kampanya gönderiminden önce risk özeti göstermek:
  - toplam alıcı
  - kara listede atlananlar
  - tahmini SMS parçası
  - kullanılacak sağlayıcı başlığı

Ticari etkisi:

- "Güvenli ve kontrollü gönderim" vaadi güçlenir.
- Kurumsal müşteriye satış yapmak kolaylaşır.

## Faz 3 - Kampanya ve CRM Değeri

Amaç: MSGNEX'i sadece SMS gönderim paneli değil, müşteri iletişim aracı haline getirmek.

Başlanan işler:

- CSV kişi import akışı sihirbaz mantığına çevrildi:
  - dosya hemen DB'ye yazılmadan analiz edilir
  - kolonlar otomatik tahmin edilir
  - telefon/ad/soyad/e-posta/izin kolonları elle eşleştirilebilir
  - önizleme gösterilir
  - hatalı telefon satırları ayrılır
  - CSV içi tekrar eden telefonlar ayrılır
  - izinli/izinsiz/bilinmeyen özeti gösterilir
  - son onaydan sonra içe aktarım yapılır

Yapılacaklar:

- Kişi içe aktarma sihirbazı:
  - CSV kolon eşleştirme
  - hatalı numara tespiti
  - tekrar eden kişi temizliği
  - izin durumu seçimi
- Segment kuralları:
  - grup bazlı
  - şehir/etiket bazlı
  - son gönderim tarihi bazlı
  - kara listede olmayanlar
- Kampanya taslakları.
- Kampanya kopyalama.
- Şablon kategorileri.
- Gönderim öncesi önizleme.
- Başarısız numaraları ayrı listeye aktarma.

Ticari etkisi:

- Müşteri "sadece SMS atmıyorum, müşteri listemi yönetiyorum" değerini hisseder.

## Faz 4 - Raporlama ve Ölçüm

Amaç: Müşteriye gönderim sonrası net sonuç göstermek.

Başlanan işler:

- Kampanya rapor modalı eklendi:
  - toplam alıcı
  - atlanan kayıt
  - başarılı/hatalı/bekleyen provider sonuçları
  - provider bulk bilgisi
  - alıcı bazlı mesaj durumu
  - provider kodu/açıklaması
- Kampanya rapor dışa aktarma başlatıldı:
  - alıcı bazlı kampanya raporu CSV olarak indirilebilir
  - yazdır/PDF için ayrı rapor çıktısı oluşturulur
  - export içinde provider kodu, açıklaması, hata ve teslim tarihleri yer alır
- Provider hata açıklamaları başlatıldı:
  - Netgsm hata kodları merkezi açıklama sözlüğüne taşındı
  - kampanya raporunda hata kodu anlamı ve önerilen aksiyon gösterilir
  - CSV ve yazdır/PDF rapor çıktısına hata anlamı eklenir
- Numara format analizi başlatıldı:
  - kampanya raporunda hatalı veya normalize edilebilir numara formatları gruplanır
  - eksik/fazla hane, harf içeren kayıt, 0/+90 formatı ve mobil olmayan formatlar ayrıştırılır
  - CSV ve yazdır/PDF rapor çıktısına numara temizlik önerileri eklenir
- Başarısız alıcı listeleme başlatıldı:
  - kampanya raporunda başarısız alıcılar ayrı blokta gösterilir
  - başarısız kayıtlar temizlik ve destek incelemesi için ayrı CSV olarak indirilebilir
  - CSV içinde provider hata kodu, hata anlamı ve numara temizlik önerisi yer alır
- Başarısız numaralar kişi temizleme akışına bağlandı:
  - kampanya raporundan başarısız alıcılar Kişiler ekranına filtreli taşınabilir
  - Kişiler ekranında eşleşen kayıtlar temizlik filtresiyle gösterilir
  - eşleşmeyen başarısız numara sayısı ayrıca belirtilir
- Başarısız numaraları kara listeye ekleme başlatıldı:
  - kampanya raporundan numara formatı/provider numara hatası olan başarısızlar kara listeye alınabilir
  - geçici provider sistem hataları otomatik kara liste adayı yapılmaz
  - kara liste sebebi kampanya temizliği kaynağıyla otomatik yazılır
- Başarısız numaraları toplu segmentleme başlatıldı:
  - kampanya raporundan başarısız alıcılar mevcut veya yeni segmente aktarılabilir
  - sadece CRM kişi listesinde eşleşen kayıtların segmenti güncellenir
  - eşleşmeyen numaralar için CSV/kara liste akışı korunur
- Firma dashboard metrikleri güçlendirildi:
  - izinli/izinsiz/bilinmeyen kişi, kara liste ve segment metrikleri eklendi
  - son 30 gün kampanya/SMS başarı-hata oranları gösterilir
  - provider hazırlığı, başlık, bağlantı ve bakiye senkronu checklist olarak izlenir
  - operasyon sağlığı uyarıları dashboard'a taşındı
- Tarih aralığına göre kampanya raporu güçlendirildi:
  - kampanya listesine bugün, son 7 gün, son 30 gün ve bu ay hızlı filtreleri eklendi
  - filtrelenen kampanyalar için toplam kampanya, alıcı, başarılı, hatalı ve bekleyen özetleri gösterilir
  - filtrelenmiş hata oranı ve atlanan alıcı sayısı görünür hale getirildi

Yapılacaklar:

- Kampanya detay raporu:
  - gönderildi
  - başarısız
  - sağlayıcıda bekleyen
  - teslim edildi
  - kara listeden atlanan
- API dokümantasyonunu ayrı geliştirici rehberi sayfasına genişletmek.
- Firma dashboard metriklerini güçlendirmek.

Ticari etkisi:

- Müşteri yaptığı işin sonucunu görür.
- Ajans ve kurumsal müşteriler için raporlama satış argümanı olur.

## Faz 5 - Otomasyon ve API Değeri

Amaç: MSGNEX'i dış sistemlerle çalışan bir iletişim katmanına çevirmek.

Başlanan işler:

- API dokümantasyonu panel içine taşındı:
  - endpoint
  - authorization
  - idempotency key
  - örnek request
  - cURL/JavaScript/PHP örnekleri
  - örnek response
  - hata durumları
  - entegrasyon öncesi kontrol listesi
  - provider/başlık/kredi notları
- API geliştirici rehberi ayrı sayfaya genişletildi:
  - API Anahtarları sayfası anahtar yönetimine odaklandı
  - endpoint, header, idempotency, request/response ve hata durumları ayrı rehbere taşındı
  - JavaScript, cURL ve PHP örnekleri geliştirici rehberinde toplandı
  - webhook ile sonuç takibi yönlendirmesi eklendi
- API key kullanım görünürlüğü başlatıldı:
  - API anahtarı bazında toplam istek, son 24 saat istek ve son kullanım zamanı gösterilir
  - başarılı/hatalı SMS sayıları API anahtarı tablosuna eklendi
  - plan bazlı rehber limitler API Anahtarları ve API Rehberi ekranında görünür hale getirildi
- Gerçek API rate limit enforcement başlatıldı:
  - external SMS API istekleri plan bazlı dakika/gün limitleriyle sınırlandı
  - aynı Idempotency-Key ile tekrar gelen mevcut istekler limitten düşmez
  - limit aşımında API `429` ve `Retry-After` header'ı döndürür
  - API Anahtarları ve API Rehberi ekranlarında limit dili uygulanan sınırlara göre güncellendi
- API audit log görünürlüğü başlatıldı:
  - API anahtarı oluşturma ve iptal işlemleri audit log'a yazılır
  - rate limit aşımı audit log'a firma, plan, limit ve kullanım kapsamıyla yazılır
  - audit metadata içinde ham API key, secret, mesaj içeriği veya alıcı listesi tutulmaz
  - admin audit log ekranında müşteri/API aktör tipi görünür hale getirildi
- Admin audit log filtreleri başlatıldı:
  - audit kayıtları arama, aksiyon, firma, aktör tipi ve tarih aralığına göre filtrelenebilir
  - sadece API olaylarını gösteren hızlı filtre eklendi
  - filtrelenen kayıt sayısı ve filtre temizleme aksiyonu eklendi
- Admin audit log dışa aktarma başlatıldı:
  - filtrelenmiş audit kayıtları CSV olarak indirilebilir
  - export içinde tarih, aktör, aktör tipi, aksiyon, hedef, firma ve metadata alanları yer alır
  - export mevcut güvenli metadata modelini kullanır; ham API key, secret, mesaj içeriği veya alıcı listesi içermez
- Müşteri firma audit log ekranı başlatıldı:
  - Profesyonel ve Ajans planındaki firmalar kendi audit kayıtlarını görebilir
  - müşteri ekranı sadece kendi firma kayıtlarını RPC üzerinden alır
  - arama, aksiyon, aktör tipi, tarih aralığı, API olayları filtresi ve CSV export eklendi
  - doğrudan audit_logs tablo erişimi müşteri tarafına açılmadı
- Müşteri bildirim merkezi başlatıldı:
  - provider bağlantısı, başlık, bakiye/senkron, webhook hatası, API rate limit, kampanya hata oranı, DLR ve izin/kara liste durumları tek ekranda toplanır
  - bildirimler önem seviyesi ve kategoriye göre filtrelenebilir
  - her bildirim doğrudan ilgili aksiyon ekranına yönlendirir
  - dashboard üzerinden bildirim merkezine hızlı geçiş eklendi
- Pilot müşteri kurulum akışı başlatıldı:
  - müşteri paneline Kurulum sayfası eklendi
  - provider, onaylı başlık, kişi listesi, segment, şablon, ilk kampanya, API ve webhook adımları checklist olarak gösterilir
  - zorunlu adımlar için ilerleme yüzdesi ve sıradaki aksiyon görünür
  - dashboard ve sidebar üzerinden kurulum akışına hızlı erişim eklendi
- Admin onboarding takibi başlatıldı:
  - admin için firma onboarding özet RPC'si eklendi
  - firma listesinde pilot hazır/provider eksik/veri bekliyor/test bekliyor durumu ve ilerleme yüzdesi görünür
  - firma detayında provider, başlık, kişi, segment ve ilk kampanya adımları ayrı onboarding kartında izlenir
  - API key ve webhook aktiflik sayıları admin takip özetine eklendi
- Satış ve pilot takip alanları başlatıldı:
  - firmalara satış durumu, pilot başlangıç tarihi, beklenen aylık SMS hacmi ve admin notu alanları eklendi
  - firma detayında Satış & Pilot Notları kartı oluşturuldu
  - firma listesinde satış durumu ve beklenen aylık hacim görünür hale getirildi
  - demo onayıyla oluşan firmalara başvuru hacmi ve mesajı satış/pilot alanlarına taşınır

Yapılacaklar:

- Webhook altyapısı:
  - kampanya tamamlandı
  - SMS başarısız oldu
  - sağlayıcı sonucu geldi
- Hazır otomasyonlar:
  - doğum günü mesajı
    - kişi kartına doğum tarihi ve özel gün alanları eklenecek
    - doğum günü yaklaşan kişiler için otomatik segment/hatırlatma üretilecek
    - müşteriye özel kutlama veya kampanya SMS şablonu seçilebilecek
  - pasif müşteri hatırlatma
  - randevu hatırlatma
  - ödeme hatırlatma
- Zapier/Make benzeri entegrasyon hazırlığı.

Ticari etkisi:

- MSGNEX sadece panel değil, işletmenin sistemlerine bağlanan ürün olur.
- Daha yüksek paket fiyatları için zemin oluşur.

## Faz 6 - Paketleme ve Satış Modeli

Amaç: Ürünü satılabilir paketlere bölmek.

Başlanan işler:

- Panel içine Planım/Paketler sayfası eklendi.
- SMS kredisi içermeyen yazılım paketi konumlandırması netleştirildi.
- Başlangıç, Profesyonel ve Ajans/Kurumsal paketleri karşılaştırıldı.
- Plan yükseltme talebi akışı eklendi:
  - müşteri Planım ekranından yazılım paketi görüşmesi talep eder
  - talep SMS kredisi veya sağlayıcı bakiyesi işlemi olarak konumlanmaz
  - admin panelinde plan talepleri listelenir ve durum takibi yapılır
- Firma planı atama ve ilk özellik kapıları başlatıldı:
  - admin firma detayından Başlangıç, Profesyonel veya Ajans/Kurumsal plan atar
  - müşteri dashboard ve Planım ekranında mevcut planını görür
  - API anahtarı oluşturma ve external API gönderimi Profesyonel/Ajans planına bağlanır
- Plan limitleri başlatıldı:
  - kişi limiti DB trigger ve müşteri UI ile uygulanır
  - kullanıcı daveti admin API'de plan limitine göre kontrol edilir
  - SMS gönderiminde tek kampanya net alıcı limiti RPC ve panelde uygulanır
- Webhook yönetim altyapısı başlatıldı:
  - Ajans/Kurumsal planına özel webhook kayıt ekranı eklendi
  - webhook endpoint ve event seçimleri RPC üzerinden yönetilir
  - signing secret tablo tarafında saklanır, müşteri listeleme çıktısına dönmez
- Webhook delivery worker başlatıldı:
  - campaign.completed ve sms.failed olayları delivery kuyruğuna alınır
  - worker endpoint aktif webhook URL'lerine imzalı POST gönderir
  - delivery başarı/hata durumu ve retry zamanı kayıt altına alınır
- Webhook delivery gözlemi eklendi:
  - müşteri webhook gönderim denemelerini ve son hataları görür
  - admin firma detayında son webhook delivery denemelerini izler
  - response status, deneme sayısı ve retry zamanı görünür hale gelir
- Provider DLR sonuçları webhook eventlerine bağlandı:
  - record_sms_delivery_event sonrası provider.status_updated event'i kuyruğa alınır
  - duplicate DLR kayıtları event üretmez
  - payload içinde mesaj, kampanya, alıcı ve provider durum bilgileri taşınır
- Webhook test ve manuel retry aksiyonları eklendi:
  - müşteri seçili webhook için canlı SMS beklemeden test delivery oluşturur
  - başarılı veya hatalı delivery kayıtları panelden tekrar kuyruğa alınabilir
  - webhook.test event'i imza ve endpoint doğrulaması için kullanılır
- Webhook dokümantasyonu güçlendirildi:
  - delivery payload JSON panelden görüntülenir
  - imza doğrulama header'ları açıklandı
  - Node.js ve PHP HMAC SHA-256 doğrulama örnekleri eklendi
- Webhook signing secret yönetimi güçlendirildi:
  - webhook oluşturma ve secret yenileme anında secret tek seferlik gösterilir
  - secret listeleme çıktısına dönmez
  - secret yenileme aksiyonu audit log'a yazılır
  - geçiş sürecinde eski ve yeni secret kabulü dokümante edilir

Önerilen paketler:

1. Başlangıç
   - 1 firma
   - temel kişi/grup yönetimi
   - manuel kampanya
   - temel rapor

2. Profesyonel
   - gelişmiş segmentler
   - şablon kategorileri
   - gelişmiş rapor
   - API key
   - audit log

3. Ajans / Kurumsal
   - çoklu firma yönetimi
   - gelişmiş yetki
   - webhook
   - özel onboarding
   - öncelikli destek

Not:

- Paketler SMS kredisi içermez.
- Paketler MSGNEX yazılım kullanım hakkı ve operasyonel özellikler üzerinden fiyatlanır.

## Ürün İçinde Güçlendirilmesi Gereken Mesajlar

Panel içinde görünmesi gereken net mesajlar:

- "SMS kredisi sağlayıcı hesabınızdan kullanılır."
- "MSGNEX SMS kredisi satmaz."
- "Gönderici başlığı sağlayıcıdan doğrulanır."
- "Manuel başlık girilemez."
- "Kara listedeki numaralar gönderimden çıkarılır."
- "Gönderim geçmişi firma bazında kayıt altına alınır."

## Öncelikli Yapılacaklar

1. Canlı Netgsm hesabıyla provider testini tamamla.
2. Provider onboarding ekranını iyileştir.
3. Gönderim öncesi risk/özet ekranını güçlendir.
4. Kişi içe aktarma sihirbazını ticari seviyeye çıkar.
5. Kampanya detay raporunu geliştir.
6. Audit log altyapısını başlat.
7. API dokümantasyonu sayfası ekle.
8. Gerçek API rate limit enforcement geliştir.

## Başarı Kriterleri

- Yeni firma 10 dakika içinde provider bağlantısını anlayıp kurabilmeli.
- Firma yanlış başlıkla SMS gönderememeli.
- Müşteri kampanya sonrası sonucu açıkça görebilmeli.
- Admin, firma ve kullanıcıları güvenle yönetebilmeli.
- Satış görüşmesinde ürünün değeri "SMS kredisi" değil "iletişim operasyonu yönetimi" olarak anlatılabilmeli.
