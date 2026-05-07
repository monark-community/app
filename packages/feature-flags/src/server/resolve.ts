import {
  getFlagDef,
  parseFlagKey,
  type FlagScope,
} from "../contracts/index"
import { readOverridesForKeys, type OverrideRow, type FlagRef } from "./data"

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

function dotted(ref: FlagRef): string {
  return `${ref.module}.${ref.key}`
}

export async function getFlags(
  keys: string[],
  scope: FlagScope = {},
): Promise<Record<string, boolean>> {
  if (keys.length === 0) return {}

  const refs: FlagRef[] = []
  const refByDotted = new Map<string, FlagRef>()
  for (const dottedKey of keys) {
    const parsed = parseFlagKey(dottedKey)
    if (!parsed) continue
    refs.push(parsed)
    refByDotted.set(dottedKey, parsed)
  }

  const rows = await readOverridesForKeys(refs, scope)
  const grouped = new Map<string, OverrideRow[]>()
  for (const row of rows) {
    const k = `${row.module}.${row.flagKey}`
    const list = grouped.get(k) ?? []
    list.push(row)
    grouped.set(k, list)
  }

  const result: Record<string, boolean> = {}
  for (const dottedKey of keys) {
    const ref = refByDotted.get(dottedKey)
    if (!ref) {
      result[dottedKey] = false
      continue
    }
    const def = getFlagDef(dottedKey)
    const override = mostSpecific(grouped.get(dotted(ref)) ?? [], scope)
    result[dottedKey] = override?.enabled ?? def?.defaultOn ?? false
  }
  return result
}

export async function isEnabled(
  key: string,
  scope: FlagScope = {},
): Promise<boolean> {
  const flags = await getFlags([key], scope)
  return flags[key] ?? false
}
