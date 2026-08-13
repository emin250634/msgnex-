import type { SmsMessage } from "@/types"

export interface PhoneFormatIssue {
  type: string
  title: string
  description: string
  action: string
  severity: "info" | "warning"
}

export function getPhoneFormatIssue(recipient?: string | null): PhoneFormatIssue | null {
  const value = (recipient || "").trim()
  const digits = value.replace(/\D/g, "")

  if (!value) {
    return {
      type: "empty",
      title: "Boş numara",
      description: "Alıcı numarası boş görünüyor.",
      action: "Kişi kaydına geçerli bir cep telefonu ekleyin.",
      severity: "warning",
    }
  }

  if (/[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(value)) {
    return {
      type: "letters",
      title: "Harf içeren numara",
      description: "Telefon alanında harf veya açıklama metni var.",
      action: "Telefon alanını sadece rakamlardan oluşacak şekilde temizleyin.",
      severity: "warning",
    }
  }

  if (digits.length < 10) {
    return {
      type: "short",
      title: "Eksik haneli numara",
      description: "Cep telefonu için gerekli 10 hane tamamlanmamış.",
      action: "Eksik kayıtları müşteri listenizde düzeltin veya gönderimden çıkarın.",
      severity: "warning",
    }
  }

  if (digits.length > 12) {
    return {
      type: "long",
      title: "Fazla haneli numara",
      description: "Telefon alanında ek rakamlar veya birleşmiş birden fazla numara olabilir.",
      action: "Numarayı tek cep telefonu olacak şekilde ayırın ve 5XXXXXXXXX formatına indirin.",
      severity: "warning",
    }
  }

  if (digits.length === 12 && digits.startsWith("90")) {
    return {
      type: "country_code",
      title: "+90 / 90 ile başlayan numara",
      description: "Numara Türkiye ülke kodu ile kaydedilmiş.",
      action: "Listeyi standart 5XXXXXXXXX formatına normalize edin.",
      severity: "info",
    }
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return {
      type: "leading_zero",
      title: "0 ile başlayan numara",
      description: "Numara başında yerel arama sıfırı var.",
      action: "Başındaki 0 kaldırılarak 5XXXXXXXXX formatında saklayın.",
      severity: "info",
    }
  }

  if (digits.length === 10 && !digits.startsWith("5")) {
    return {
      type: "not_mobile",
      title: "Mobil olmayan format",
      description: "Türkiye cep telefonu formatı 5 ile başlamalıdır.",
      action: "Sabit hat veya hatalı kayıtları kişi listesinden ayırın.",
      severity: "warning",
    }
  }

  if (digits.length === 10 && digits.startsWith("5") && /[^\d]/.test(value)) {
    return {
      type: "separators",
      title: "Ayraç içeren numara",
      description: "Numara doğru görünüyor ancak boşluk, parantez veya tire içeriyor.",
      action: "Veri kalitesi için telefonları sadece rakam olarak saklayın.",
      severity: "info",
    }
  }

  return null
}

export function phoneIssueSummary(recipient?: string | null) {
  return getPhoneFormatIssue(recipient)?.title || "Standart format"
}

export function isSuppressionCandidate(message: SmsMessage) {
  const issue = getPhoneFormatIssue(message.recipient)
  const providerCode = message.provider_status_code
  const numberErrorCodes = new Set(["50", "51", "52", "INVALID_RECIPIENT"])

  return Boolean(
    issue?.severity === "warning" ||
    (providerCode && numberErrorCodes.has(providerCode))
  )
}

export function normalizePhoneForCompare(phone?: string | null) {
  const digits = (phone || "").replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("90")) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  return digits
}
