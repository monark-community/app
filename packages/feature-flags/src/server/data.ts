import { getDb, type Prisma, type Role } from "@monark/db"
import type { FlagKey, FlagScope } from "../contracts/index"

export type OverrideRow = {
  id: string
  flagKey: string
  organizationId: string | null
  userId: string | null
  role: Role | null
  enabled: boolean
  setById: string
  setAt: Date
  note: string | null
}

export async function readFlagDefinitions(): Promise<
  Array<{ key: string; defaultOn: boolean }>
> {
  const db = getDb()
  return db.featureFlag.findMany({ select: { key: true, defaultOn: true } })
}

export async function readOverridesForKeys(
  keys: FlagKey[],
  scope: FlagScope,
): Promise<OverrideRow[]> {
  if (keys.length === 0) return []
  const db = getDb()

  const scopeFilter: Prisma.FeatureFlagOverrideWhereInput[] = [
    { organizationId: null, userId: null, role: null },
  ]
  if (scope.organizationId) {
    scopeFilter.push({
      organizationId: scope.organizationId,
      userId: null,
      role: null,
    })
  }
  if (scope.role) {
    scopeFilter.push({ role: scope.role, organizationId: null, userId: null })
  }
  if (scope.userId) {
    scopeFilter.push({
      userId: scope.userId,
      organizationId: null,
      role: null,
    })
  }

  return db.featureFlagOverride.findMany({
    where: {
      flagKey: { in: keys },
      OR: scopeFilter,
    },
    orderBy: { setAt: "desc" },
  })
}

export async function readOverridesForFlag(flagKey: FlagKey): Promise<OverrideRow[]> {
  const db = getDb()
  return db.featureFlagOverride.findMany({
    where: { flagKey },
    orderBy: { setAt: "desc" },
  })
}

export async function upsertFlagDefinition(
  key: string,
  description: string,
  defaultOn: boolean,
): Promise<void> {
  const db = getDb()
  await db.featureFlag.upsert({
    where: { key },
    create: { key, description, defaultOn },
    update: { description, defaultOn },
  })
}

export async function writeOverride(input: {
  flagKey: FlagKey
  scope: FlagScope
  enabled: boolean
  setById: string
  note?: string
}): Promise<void> {
  const db = getDb()
  const { flagKey, scope, enabled, setById, note } = input

  await db.$transaction(async (tx) => {
    const existing = await tx.featureFlagOverride.findFirst({
      where: {
        flagKey,
        organizationId: scope.organizationId ?? null,
        userId: scope.userId ?? null,
        role: scope.role ?? null,
      },
    })

    if (existing) {
      await tx.featureFlagOverride.update({
        where: { id: existing.id },
        data: { enabled, setById, setAt: new Date(), note: note ?? null },
      })
    } else {
      await tx.featureFlagOverride.create({
        data: {
          flagKey,
          organizationId: scope.organizationId ?? null,
          userId: scope.userId ?? null,
          role: scope.role ?? null,
          enabled,
          setById,
          note: note ?? null,
        },
      })
    }
  })
}

export async function deleteOverride(id: string): Promise<void> {
  const db = getDb()
  await db.featureFlagOverride.delete({ where: { id } })
}
