import { getDb } from "@monark/db";
import { ValidationError } from "@monark/common";
import { decrypt, encrypt, loadEncryptionKey } from "@monark/common/crypto";

// The org-secrets store. Values are encrypted at rest with AES-256-GCM keyed by
// SECRETS_ENCRYPTION_KEY (separate from TOTP's key so their blast radii stay
// independent). The key is loaded lazily (fail-closed) so a deploy that never
// touches secrets — e.g. CI — doesn't need it set.
const KEY_ENV = "SECRETS_ENCRYPTION_KEY";

// The safe projection: names + metadata, NEVER the ciphertext or the value.
// This is the only shape that ever crosses the tRPC boundary.
export type SecretSummary = {
  id: string;
  key: string;
  description: string | null;
  createdBy: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const SUMMARY_SELECT = {
  id: true,
  key: true,
  description: true,
  createdBy: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Names + metadata for one org, ordered by key. No value, no ciphertext.
// Unbounded on purpose: the number of secrets per org is small (env-var scale),
// and both the admin UI and the automation editor's name picker want the full
// set at once.
export async function listSecrets(organizationId: string): Promise<SecretSummary[]> {
  const db = getDb();
  return db.secret.findMany({
    where: { organizationId },
    orderBy: { key: "asc" },
    select: SUMMARY_SELECT,
  });
}

// Create or update a secret (identity is the org+key unique). The value is
// WRITE-ONLY and optional on update: pass it to (re)encrypt the value, omit it
// to leave the stored value untouched (a description-only edit). Creating a new
// secret requires a value. Returns whether a new secret was created so the
// caller can emit the right domain event.
export async function setSecret(input: {
  organizationId: string;
  key: string;
  /** Omit (or empty) on update to keep the existing value; required to create. */
  value?: string;
  description?: string | null;
  createdBy: string;
}): Promise<{ created: boolean }> {
  const db = getDb();
  const where = {
    organizationId_key: { organizationId: input.organizationId, key: input.key },
  };
  const existing = await db.secret.findUnique({ where, select: { id: true } });
  const hasValue = input.value !== undefined && input.value !== "";
  if (!existing && !hasValue) {
    throw new ValidationError("A value is required to create a secret.");
  }

  if (hasValue) {
    // Prisma's Bytes input wants Uint8Array<ArrayBuffer>; Node's Buffer widens to
    // ArrayBufferLike, so re-wrap (the house pattern from TOTP's store).
    const enc = encrypt(input.value as string, loadEncryptionKey(KEY_ENV));
    const cipher = {
      valueCipher: Uint8Array.from(enc.cipher),
      valueIv: Uint8Array.from(enc.iv),
      valueTag: Uint8Array.from(enc.tag),
    };
    // Atomic upsert: a concurrent create of the same (org, key) can't race into a
    // raw P2002 the way a find-then-create would. `created` is best-effort (from
    // the read above) — under a rare tie it only affects which event fires, never
    // data integrity.
    await db.secret.upsert({
      where,
      create: {
        organizationId: input.organizationId,
        key: input.key,
        ...cipher,
        description: input.description ?? null,
        createdBy: input.createdBy,
      },
      update: {
        ...cipher,
        // Only touch the description when the caller passed one, so a value-only
        // update doesn't clobber an existing note.
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return { created: existing === null };
  }

  // No value: a description-only edit. `existing` is non-null here (a create
  // without a value was rejected above); re-assert for the type-checker.
  if (!existing) {
    throw new ValidationError("A value is required to create a secret.");
  }
  await db.secret.update({
    where: { id: existing.id },
    data: { ...(input.description !== undefined ? { description: input.description } : {}) },
  });
  return { created: false };
}

// Server-only. Decrypt and return a secret's plaintext value, stamping
// `lastUsedAt`. NEVER expose the return value over tRPC, log it, or return it
// as automation node output. Returns null when the org has no such secret.
export async function getSecretValue(organizationId: string, key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.secret.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!row) return null;
  const value = decrypt(
    {
      // Prisma returns Bytes columns as Uint8Array; the crypto helper wants Buffer.
      cipher: Buffer.from(row.valueCipher),
      iv: Buffer.from(row.valueIv),
      tag: Buffer.from(row.valueTag),
    },
    loadEncryptionKey(KEY_ENV),
  );
  await db.secret.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return value;
}

// Delete a secret by name. Returns whether a row was actually removed so the
// caller only emits `secrets.deleted` on a real delete.
export async function deleteSecret(organizationId: string, key: string): Promise<boolean> {
  const db = getDb();
  const res = await db.secret.deleteMany({ where: { organizationId, key } });
  return res.count > 0;
}
