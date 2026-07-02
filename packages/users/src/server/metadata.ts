import { getDb } from "@monark/db";
import { ValidationError } from "@monark/common";

const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const KEY_RE = /^[a-z][a-z0-9_.-]*$/;

function assertModule(module: string): void {
  if (!MODULE_RE.test(module)) {
    throw new ValidationError(`Invalid metadata module name : ${module}`);
  }
}

function assertKey(key: string): void {
  if (key.length === 0 || key.length > 200 || !KEY_RE.test(key)) {
    throw new ValidationError(`Invalid metadata key : ${key}`);
  }
}

export type UserMetadataRow = {
  id: string;
  userId: string;
  module: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Returns every metadata row for one user × one module. Caller is
 * expected to have already gated on
 * `users.read-metadata-for-module-<module>`.
 */
export async function listUserMetadataForModule(
  userId: string,
  module: string,
): Promise<UserMetadataRow[]> {
  assertModule(module);
  const db = getDb();
  const rows = await db.userMetadata.findMany({
    where: { userId, module },
    orderBy: { key: "asc" },
  });
  return rows.map((r) => ({ ...r, value: r.value }));
}

export async function getUserMetadataValue(
  userId: string,
  module: string,
  key: string,
): Promise<unknown | undefined> {
  assertModule(module);
  assertKey(key);
  const db = getDb();
  const row = await db.userMetadata.findUnique({
    where: { userId_module_key: { userId, module, key } },
    select: { value: true },
  });
  return row?.value;
}

/**
 * Upserts one metadata cell. Idempotent ; calling twice with the same
 * value returns the same row + bumps `updatedAt`. Caller has already
 * gated on `users.write-metadata-for-module-<module>`.
 */
export async function setUserMetadataValue(input: {
  userId: string;
  module: string;
  key: string;
  value: unknown;
}): Promise<UserMetadataRow> {
  assertModule(input.module);
  assertKey(input.key);
  const db = getDb();
  const row = await db.userMetadata.upsert({
    where: {
      userId_module_key: {
        userId: input.userId,
        module: input.module,
        key: input.key,
      },
    },
    create: {
      userId: input.userId,
      module: input.module,
      key: input.key,
      value: input.value as never,
    },
    update: { value: input.value as never },
  });
  return { ...row, value: row.value };
}

export async function deleteUserMetadataValue(
  userId: string,
  module: string,
  key: string,
): Promise<void> {
  assertModule(module);
  assertKey(key);
  const db = getDb();
  await db.userMetadata
    .delete({
      where: { userId_module_key: { userId, module, key } },
    })
    .catch(() => {
      // Idempotent : missing row is not an error.
    });
}

export async function deleteUserMetadataForModule(
  userId: string,
  module: string,
): Promise<{ count: number }> {
  assertModule(module);
  const db = getDb();
  return db.userMetadata.deleteMany({ where: { userId, module } });
}
