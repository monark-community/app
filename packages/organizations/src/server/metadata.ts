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

export type OrganizationMetadataRow = {
  id: string;
  organizationId: string;
  module: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Returns every metadata row for one org × one module. Caller is
 * expected to have already gated on
 * `organizations.read-metadata-for-module-<module>`.
 */
export async function listOrganizationMetadataForModule(
  organizationId: string,
  module: string,
): Promise<OrganizationMetadataRow[]> {
  assertModule(module);
  const db = getDb();
  const rows = await db.organizationMetadata.findMany({
    where: { organizationId, module },
    orderBy: { key: "asc" },
  });
  return rows.map((r) => ({ ...r, value: r.value }));
}

export async function getOrganizationMetadataValue(
  organizationId: string,
  module: string,
  key: string,
): Promise<unknown | undefined> {
  assertModule(module);
  assertKey(key);
  const db = getDb();
  const row = await db.organizationMetadata.findUnique({
    where: { organizationId_module_key: { organizationId, module, key } },
    select: { value: true },
  });
  return row?.value;
}

export async function setOrganizationMetadataValue(input: {
  organizationId: string;
  module: string;
  key: string;
  value: unknown;
}): Promise<OrganizationMetadataRow> {
  assertModule(input.module);
  assertKey(input.key);
  const db = getDb();
  const row = await db.organizationMetadata.upsert({
    where: {
      organizationId_module_key: {
        organizationId: input.organizationId,
        module: input.module,
        key: input.key,
      },
    },
    create: {
      organizationId: input.organizationId,
      module: input.module,
      key: input.key,
      value: input.value as never,
    },
    update: { value: input.value as never },
  });
  return { ...row, value: row.value };
}

export async function deleteOrganizationMetadataValue(
  organizationId: string,
  module: string,
  key: string,
): Promise<void> {
  assertModule(module);
  assertKey(key);
  const db = getDb();
  await db.organizationMetadata
    .delete({
      where: { organizationId_module_key: { organizationId, module, key } },
    })
    .catch(() => {});
}

export async function deleteOrganizationMetadataForModule(
  organizationId: string,
  module: string,
): Promise<{ count: number }> {
  assertModule(module);
  const db = getDb();
  return db.organizationMetadata.deleteMany({
    where: { organizationId, module },
  });
}
