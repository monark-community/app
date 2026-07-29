import {
  decrypt,
  encrypt,
  loadEncryptionKey,
  timingSafeEqualHex,
  type EncryptedPayload,
} from "@monark/common/crypto";

// TOTP secret encryption. The AES-256-GCM primitive lives in
// `@monark/common/crypto` (shared with the org-secrets store) ; this module
// just binds it to the TOTP-scoped key so TOTP secrets and other secrets never
// share an encryption key.
const KEY_ENV = "TOTP_ENCRYPTION_KEY";

export type { EncryptedPayload };

export function encryptSecret(plaintext: string): EncryptedPayload {
  return encrypt(plaintext, loadEncryptionKey(KEY_ENV));
}

export function decryptSecret(payload: EncryptedPayload): string {
  return decrypt(payload, loadEncryptionKey(KEY_ENV));
}

export { timingSafeEqualHex };
