export interface ProviderErrorInfo {
  title: string
  description: string
  action: string
  severity: "info" | "warning" | "danger"
}

const NETGSM_ERRORS: Record<string, ProviderErrorInfo> = {
  "00": {
    title: "Provider kabul etti",
    description: "Netgsm gönderimi kabul etti. Teslim sonucu DLR ile güncellenir.",
    action: "DLR sonucunu bekleyin.",
    severity: "info",
  },
  "0": {
    title: "Provider kabul etti",
    description: "Netgsm gönderimi kabul etti. Teslim sonucu DLR ile güncellenir.",
    action: "DLR sonucunu bekleyin.",
    severity: "info",
  },
  "20": {
    title: "Mesaj içeriği geçersiz",
    description: "Mesaj metni, karakter sayısı veya mesaj formatı sağlayıcı kurallarına uymuyor.",
    action: "Mesaj metnini, özel karakterleri ve SMS parça sayısını kontrol edin.",
    severity: "warning",
  },
  "30": {
    title: "Kullanıcı bilgisi veya API yetkisi hatalı",
    description: "Netgsm kullanıcı kodu, secret veya API yetkisi geçersiz olabilir.",
    action: "Admin panelinden provider bilgilerini ve Netgsm API yetkisini doğrulayın.",
    severity: "danger",
  },
  "40": {
    title: "Gönderici başlığı geçersiz",
    description: "Seçilen başlık Netgsm hesabında onaylı veya kullanılabilir görünmüyor.",
    action: "Provider başlıklarını tekrar sorgulayın ve onaylı başlık seçin.",
    severity: "danger",
  },
  "41": {
    title: "Gönderici başlığı geçersiz",
    description: "Seçilen başlık Netgsm hesabında onaylı veya kullanılabilir görünmüyor.",
    action: "Provider başlıklarını tekrar sorgulayın ve onaylı başlık seçin.",
    severity: "danger",
  },
  "50": {
    title: "Alıcı numarası geçersiz",
    description: "Alıcı telefon formatı sağlayıcı tarafından kabul edilmedi.",
    action: "Telefonları 5XXXXXXXXX formatına normalize edin ve hatalı kayıtları temizleyin.",
    severity: "warning",
  },
  "51": {
    title: "Alıcı numarası geçersiz",
    description: "Alıcı telefon formatı sağlayıcı tarafından kabul edilmedi.",
    action: "Telefonları 5XXXXXXXXX formatına normalize edin ve hatalı kayıtları temizleyin.",
    severity: "warning",
  },
  "52": {
    title: "Alıcı numarası geçersiz",
    description: "Alıcı telefon formatı sağlayıcı tarafından kabul edilmedi.",
    action: "Telefonları 5XXXXXXXXX formatına normalize edin ve hatalı kayıtları temizleyin.",
    severity: "warning",
  },
  "60": {
    title: "Hesap paketi uygun değil",
    description: "Netgsm hesabının gönderim paketi veya servis yetkisi bu işlem için uygun değil.",
    action: "Netgsm hesabındaki paket/servis yetkisini kontrol edin.",
    severity: "danger",
  },
  "70": {
    title: "Provider parametreleri geçersiz",
    description: "Gönderim isteğinde Netgsm tarafından kabul edilmeyen bir parametre var.",
    action: "Başlık, mesaj, alıcı listesi ve provider ayarlarını birlikte kontrol edin.",
    severity: "warning",
  },
  "100": {
    title: "Provider sistem hatası",
    description: "Netgsm tarafında geçici sistem hatası olabilir.",
    action: "Bir süre sonra tekrar deneyin; devam ederse sağlayıcı destek kaydı açın.",
    severity: "danger",
  },
  INVALID_RECIPIENT: {
    title: "Alıcı formatı geçersiz",
    description: "MSGNEX gönderim öncesinde telefon formatını geçersiz buldu.",
    action: "Kişi listesindeki telefon formatlarını temizleyin.",
    severity: "warning",
  },
  INVALID_MESSAGE: {
    title: "Mesaj boş veya geçersiz",
    description: "Gönderilecek mesaj içeriği boş veya kabul edilemez durumda.",
    action: "Mesaj şablonunu ve kampanya metnini kontrol edin.",
    severity: "warning",
  },
  INVALID_SENDER: {
    title: "Başlık formatı geçersiz",
    description: "Gönderici başlığı sağlayıcının izin verdiği uzunluk veya formata uymuyor.",
    action: "Onaylı provider başlıklarından geçerli bir başlık seçin.",
    severity: "danger",
  },
  PROVIDER_REQUEST_FAILED: {
    title: "Provider isteği tamamlanamadı",
    description: "MSGNEX provider endpointine ulaşamadı veya provider HTTP hatası döndü.",
    action: "Provider bağlantısını, kullanıcı bilgilerini ve ağ durumunu kontrol edin.",
    severity: "danger",
  },
  TEST_OK: {
    title: "Test provider başarılı",
    description: "Test provider işlemi başarıyla tamamlandı.",
    action: "Gerçek gönderim için canlı provider ayarlarını ayrıca doğrulayın.",
    severity: "info",
  },
}

export function getProviderErrorInfo(providerName?: string | null, code?: string | null): ProviderErrorInfo | null {
  const normalizedCode = code?.trim()
  if (!normalizedCode) return null

  const provider = providerName?.trim().toLowerCase()
  if (!provider || provider === "netgsm" || provider === "test") {
    return NETGSM_ERRORS[normalizedCode] ?? null
  }

  return null
}

export function providerErrorSummary(providerName?: string | null, code?: string | null) {
  const info = getProviderErrorInfo(providerName, code)
  if (!info) return code || "-"
  return `${code}: ${info.title}`
}
