import { createHash, randomBytes } from "node:crypto";
import { getDb, type Prisma } from "@monark/db";

export type ApiKeyRow = Prisma.ApiKeyGetPayload<Record<string, never>>;

// Recognizable prefix (like webhooks' `whsec_`), base64url body. The plaintext
// is returned once at mint and never stored — only its SHA-256 hash, matching
// every other secret-by-token surface (invites, webhooks, trusted-devices).
const KEY_PREFIX = "mrk_";
const PREFIX_DISPLAY_LEN = 12; // leading plaintext chars kept for display

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function mintKey(): { plaintext: string; tokenHash: string; prefix: string } {
  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    tokenHash: hashKey(plaintext),
    prefix: plaintext.slice(0, PREFIX_DISPLAY_LEN),
  };
}

export function hasKeyPrefix(plaintext: string): boolean {
  return plaintext.startsWith(KEY_PREFIX);
}

export async function createApiKeyRow(input: {
  organizationId: string;
  ownerUserId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  expiresAt: Date | null;
  createdBy: string;
  // Least-privilege ceiling. Defaults to full authority (backward-compatible).
  fullAccess?: boolean;
  permissions?: string[];
}): Promise<ApiKeyRow> {
  const { fullAccess = true, permissions = [], ...rest } = input;
  return getDb().apiKey.create({ data: { ...rest, fullAccess, permissions } });
}

// Includes the owner's liveness fields so authentication can reject a key whose
// principal was deactivated (a disabled service account, or a suspended user).
export async function findApiKeyByHash(tokenHash: string) {
  return getDb().apiKey.findUnique({
    where: { tokenHash },
    include: { owner: { select: { disabledAt: true, deletedAt: true } } },
  });
}

/** The caller's own keys in one org, newest first. Never returns the hash —
 *  a projection safe for the management UI. */
export async function listApiKeysForOwner(organizationId: string, ownerUserId: string) {
  return getDb().apiKey.findMany({
    where: { organizationId, ownerUserId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      prefix: true,
      fullAccess: true,
      permissions: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export async function findApiKeyForOwner(
  id: string,
  organizationId: string,
  ownerUserId: string,
): Promise<ApiKeyRow | null> {
  return getDb().apiKey.findFirst({ where: { id, organizationId, ownerUserId } });
}

export async function revokeApiKeyRow(id: string): Promise<void> {
  await getDb().apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

// Debounce `lastUsedAt` writes so authentication doesn't do a DB write on every
// single request — only stamp when the stored value is stale.
const LAST_USED_DEBOUNCE_MS = 60_000;
export async function touchLastUsed(id: string, current: Date | null): Promise<void> {
  const now = Date.now();
  if (current && now - current.getTime() < LAST_USED_DEBOUNCE_MS) return;
  await getDb().apiKey.update({ where: { id }, data: { lastUsedAt: new Date(now) } });
}
