import { FLAGS, type FlagKey, type FlagScope } from "../contracts/index"
import { readOverridesForKeys, type OverrideRow } from "./data"

/**
 * Resolves the winning override for one flag against a scope, applying
 * the precedence: user > role > org > global. Exported so the unit suite
 * can exercise the precedence logic without standing up a database.
 */
export function mostSpecific(
  overrides: OverrideRow[],
  scope: FlagScope,
): OverrideRow | undefined {
  const byUser = scope.userId
    ? overrides.find((o) => o.userId === scope.userId)
    : undefined
  if (byUser) return byUser

  const byRole = scope.roleId
    ? overrides.find((o) => o.roleId === scope.roleId)
    : undefined
  if (byRole) return byRole

  const byOrg = scope.organizationId
    ? overrides.find((o) => o.organizationId === scope.organizationId)
    : undefined
  if (byOrg) return byOrg

  const global = overrides.find(
    (o) => o.userId === null && o.roleId === null && o.organizationId === null,
  )
  return global
}

export async function getFlags<K extends FlagKey>(
  keys: K[],
  scope: FlagScope = {},
): Promise<Record<K, boolean>> {
  if (keys.length === 0) return {} as Record<K, boolean>

  const rows = await readOverridesForKeys(keys, scope)
  const grouped = new Map<string, OverrideRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.flagKey) ?? []
    list.push(row)
    grouped.set(row.flagKey, list)
  }

  const result = {} as Record<K, boolean>
  for (const key of keys) {
    const override = mostSpecific(grouped.get(key) ?? [], scope)
    result[key] = override?.enabled ?? FLAGS[key].defaultOn
  }
  return result
}

export async function isEnabled(key: FlagKey, scope: FlagScope = {}): Promise<boolean> {
  const flags = await getFlags([key], scope)
  return flags[key] ?? false
}
