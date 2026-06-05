import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey() {
  const secret = process.env.PROVIDER_SECRET_ENCRYPTION_KEY
  if (!secret || secret.length < 16) {
    throw new Error("PROVIDER_SECRET_ENCRYPTION_KEY tanımlı değil veya çok kısa")
  }

  return crypto.createHash("sha256").update(secret).digest()
}

export function encryptProviderSecret(plainText: string) {
  const value = plainText.trim()
  if (!value) {
    throw new Error("Provider secret boş olamaz")
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptProviderSecret(encryptedSecret: string) {
  const [version, ivBase64, authTagBase64, encryptedBase64] = encryptedSecret.split(":")
  if (version !== "v1" || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Provider secret formatı geçersiz")
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64"),
    { authTagLength: AUTH_TAG_LENGTH }
  )
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
