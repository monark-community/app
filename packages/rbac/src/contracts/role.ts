// Re-export the Prisma-generated Role enum so it's importable from the contracts
// surface without forcing consumers to depend on @monark/db.
export { Role } from "@monark/db"
export type { Role as RoleType } from "@monark/db"

const RANK: Record<string, number> = {
  MONARK_ADMIN: 100,
  ADMIN: 80,
  DEVELOPER: 60,
  AMBASSADOR: 50,
  STUDENT: 20,
}

export function rankOf(role: string): number {
  return RANK[role] ?? 0
}

export function pickHighest<R extends string>(roles: R[]): R | null {
  if (roles.length === 0) return null
  return roles.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a))
}
