import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// Shared symmetric-encryption primitive (AES-256-GCM). Server-only — imported
// via the `@monark/common/crypto` subpath so `node:crypto` never reaches a
// client bundle. Each caller passes its own key (loaded from a purpose-specific
// env var via `loadEncryptionKey`), so blast radius stays scoped per feature
// (TOTP secrets, org secrets, …) rather than sharing one key.
//
// 12-byte IV is the GCM standard ; 16-byte auth tag is the default.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export type EncryptedPayload = {
  cipher: Buffer;
  iv: Buffer;
  tag: Buffer;
};

/**
 * Load + validate a 32-byte AES key from a hex-encoded env var. Throws a clear,
 * env-var-named error when unset or the wrong length, so a misconfigured deploy
 * fails loudly (fail-closed) instead of silently mis-encrypting.
 */
export function loadEncryptionKey(envVarName: string): Buffer {
  const hex = process.env[envVarName];
  if (!hex) {
    throw new Error(
      `${envVarName} is not set. Generate with \`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"\` and add it to the api env.`,
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${envVarName} must be ${KEY_LENGTH} bytes hex-encoded (${KEY_LENGTH * 2} chars); got ${key.length} bytes.`,
    );
  }
  return key;
}

/** AES-256-GCM encrypt. Returns the ciphertext, the random IV, and the auth tag. */
export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { cipher: ciphertext, iv, tag };
}

/** AES-256-GCM decrypt. Throws if the key is wrong or the payload was tampered. */
export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv);
  decipher.setAuthTag(payload.tag);
  const plaintext = Buffer.concat([decipher.update(payload.cipher), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Timing-safe comparison of two hex-encoded strings (unequal length → false). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
