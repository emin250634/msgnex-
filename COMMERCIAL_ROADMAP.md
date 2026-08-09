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

Yapılacaklar:

- KVKK/izinli iletişim ekranlarını güçlendirmek.
- Kara liste yönetimini daha görünür hale getirmek.
- İçe aktarılan kişiler için izin durumu alanı eklemek.
- Firma bazlı audit log ekranı oluşturmak.
- Kritik admin işlemlerini audit log'a yazmak.
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

Yapılacaklar:

- Kampanya detay raporu:
  - gönderildi
  - başarısız
  - sağlayıcıda bekleyen
  - teslim edildi
  - kara listeden atlanan
- Firma dashboard metriklerini güçlendirmek.
- Tarih aralığına göre kampanya raporu.
- CSV/PDF rapor dışa aktarma.
- Provider hata kodu açıklamaları.
- En çok hata veren numara formatları.

Ticari etkisi:

- Müşteri yaptığı işin sonucunu görür.
- Ajans ve kurumsal müşteriler için raporlama satış argümanı olur.

## Faz 5 - Otomasyon ve API Değeri

Amaç: MSGNEX'i dış sistemlerle çalışan bir iletişim katmanına çevirmek.

Yapılacaklar:

- API dokümantasyonu sayfası.
- API key kullanım limitleri.
- Webhook altyapısı:
  - kampanya tamamlandı
  - SMS başarısız oldu
  - sağlayıcı sonucu geldi
- Hazır otomasyonlar:
  - doğum günü mesajı
  - pasif müşteri hatırlatma
  - randevu hatırlatma
  - ödeme hatırlatma
- Zapier/Make benzeri entegrasyon hazırlığı.

Ticari etkisi:

- MSGNEX sadece panel değil, işletmenin sistemlerine bağlanan ürün olur.
- Daha yüksek paket fiyatları için zemin oluşur.

## Faz 6 - Paketleme ve Satış Modeli

Amaç: Ürünü satılabilir paketlere bölmek.

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
8. Paketleme ve fiyatlandırma sayfası tasarla.

## Başarı Kriterleri

- Yeni firma 10 dakika içinde provider bağlantısını anlayıp kurabilmeli.
- Firma yanlış başlıkla SMS gönderememeli.
- Müşteri kampanya sonrası sonucu açıkça görebilmeli.
- Admin, firma ve kullanıcıları güvenle yönetebilmeli.
- Satış görüşmesinde ürünün değeri "SMS kredisi" değil "iletişim operasyonu yönetimi" olarak anlatılabilmeli.
