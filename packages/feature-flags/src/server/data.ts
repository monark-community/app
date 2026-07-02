import { getDb, type Prisma } from "@monark/db";
import type { FlagScope } from "../contracts/index";

export type OverrideRow = {
  id: string;
  module: string;
  flagKey: string;
  organizationId: string | null;
  userId: string | null;
  roleId: string | null;
  enabled: boolean;
  setById: string;
  setAt: Date;
  note: string | null;
};

export type FlagRef = { module: string; key: string };

export async function readFlagDefinitions(): Promise<
  Array<{ module: string; key: string; defaultOn: boolean }>
> {
  const db = getDb();
  return db.featureFlag.findMany({
    select: { module: true, key: true, defaultOn: true },
  });
}

export async function readOverridesForKeys(
  refs: FlagRef[],
  scope: FlagScope,
): Promise<OverrideRow[]> {
  if (refs.length === 0) return [];
  const db = getDb();

  const scopeFilter: Prisma.FeatureFlagOverrideWhereInput[] = [
    { organizationId: null, userId: null, roleId: null },
  ];
  if (scope.organizationId) {
    scopeFilter.push({
      organizationId: scope.organizationId,
      userId: null,
      roleId: null,
    });
  }
  if (scope.roleId) {
    scopeFilter.push({
      roleId: scope.roleId,
      organizationId: null,
      userId: null,
    });
  }
  if (scope.userId) {
    scopeFilter.push({
      userId: scope.userId,
      organizationId: null,
      roleId: null,
    });
  }

  // Group refs by module to keep the WHERE clause shallow ; one OR
  // group per module with its keys becomes a single index hit on the
  // (module, flagKey) compound index.
  const byModule = new Map<string, string[]>();
  for (const ref of refs) {
    const list = byModule.get(ref.module) ?? [];
    list.push(ref.key);
    byModule.set(ref.module, list);
  }
  const flagFilter: Prisma.FeatureFlagOverrideWhereInput[] = [];
  for (const [module, keys] of byModule) {
    flagFilter.push({ module, flagKey: { in: keys } });
  }

  return db.featureFlagOverride.findMany({
    where: {
      OR: flagFilter,
      AND: { OR: scopeFilter },
    },
    orderBy: { setAt: "desc" },
  });
}

export async function readOverridesForFlag(ref: FlagRef): Promise<OverrideRow[]> {
  const db = getDb();
  return db.featureFlagOverride.findMany({
    where: { module: ref.module, flagKey: ref.key },
    orderBy: { setAt: "desc" },
  });
}

export async function upsertFlagDefinition(
  module: string,
  key: string,
  description: string,
  defaultOn: boolean,
): Promise<void> {
  const db = getDb();
  await db.featureFlag.upsert({
    where: { module_key: { module, key } },
    create: { module, key, description, defaultOn },
    update: { description, defaultOn },
  });
}

export async function writeOverride(input: {
  module: string;
  flagKey: string;
  scope: FlagScope;
  enabled: boolean;
  setById: string;
  note?: string;
}): Promise<void> {
  const db = getDb();
  const { module, flagKey, scope, enabled, setById, note } = input;

  await db.$transaction(async (tx) => {
    const existing = await tx.featureFlagOverride.findFirst({
      where: {
        module,
        flagKey,
        organizationId: scope.organizationId ?? null,
        userId: scope.userId ?? null,
        roleId: scope.roleId ?? null,
      },
    });

    if (existing) {
      await tx.featureFlagOverride.update({
        where: { id: existing.id },
        data: { enabled, setById, setAt: new Date(), note: note ?? null },
      });
    } else {
      await tx.featureFlagOverride.create({
        data: {
          module,
          flagKey,
          organizationId: scope.organizationId ?? null,
          userId: scope.userId ?? null,
          roleId: scope.roleId ?? null,
          enabled,
          setById,
          note: note ?? null,
        },
      });
    }
  });
}

export async function deleteOverride(id: string): Promise<void> {
  const db = getDb();
  await db.featureFlagOverride.delete({ where: { id } });
}
