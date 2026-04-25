import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

// AES-256-GCM. 12-byte IV is the standard; 16-byte auth tag is the default.
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const KEY_LENGTH = 32

function loadKey(): Buffer {
  const hex = process.env.TOTP_ENCRYPTION_KEY
  if (!hex) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY is not set. Generate with `node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"` and add to the api env.",
    )
  }
  const key = Buffer.from(hex, "hex")
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes hex-encoded (${KEY_LENGTH * 2} chars); got ${key.length} bytes.`,
    )
  }
  return key
}

export type EncryptedPayload = {
  cipher: Buffer
  iv: Buffer
  tag: Buffer
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = loadKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return { cipher: ciphertext, iv, tag }
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = loadKey()
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv)
  decipher.setAuthTag(payload.tag)
  const plaintext = Buffer.concat([
    decipher.update(payload.cipher),
    decipher.final(),
  ])
  return plaintext.toString("utf8")
}

// Timing-safe string comparison; both inputs are hex-encoded same-length.
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
