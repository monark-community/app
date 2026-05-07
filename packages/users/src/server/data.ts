import { getDb, type Prisma } from "@monark/db"

export type UserRow = Prisma.UserGetPayload<Record<string, never>>

export async function findById(id: string): Promise<UserRow | null> {
  const db = getDb()
  return db.user.findUnique({ where: { id } })
}

export type UserStatusFilter =
  | "active"
  | "disabled"
  | "pending-deletion"

// Admin-facing listing. Cursor-based pagination on `id` ordered by
// `createdAt desc, id desc` so newest registrations float up. Filters
// out already-anonymized rows (email ending with `@monark.invalid`,
// stamped by hardDeleteUser) so the admin list shows live identities ;
// pending-deletion rows stay visible because admins still need to act
// on them. `search` matches email or displayName case-insensitively.
//
// Optional filters layered on top :
//  - `roleIds` : user has at least one active RoleAssignment whose
//    `roleId` is in the list. Empty / undefined ⇒ no role constraint.
//  - `statuses` : narrows to a subset of active / disabled /
//    pending-deletion via a boolean OR over the canonical fields.
//  - `emailVerified` : tri-state — `undefined` no constraint, `true`
//    only verified rows, `false` only unverified.
//  - `joinedAfter` : only rows with `createdAt >= joinedAfter`. The
//    UI exposes presets ("last 30 days") that translate to this.
export async function listUsersForAdmin(opts: {
  search?: string
  cursor?: string
  limit: number
  roleIds?: string[]
  statuses?: UserStatusFilter[]
  emailVerified?: boolean
  joinedAfter?: Date
}): Promise<{ items: UserRow[]; nextCursor: string | null }> {
  const db = getDb()
  const ands: Prisma.UserWhereInput[] = [
    { NOT: { email: { endsWith: "@monark.invalid" } } },
  ]
  const search = opts.search?.trim()
  if (search) {
    ands.push({
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
      ],
    })
  }
  if (opts.roleIds && opts.roleIds.length > 0) {
    // Any active role assignment whose `roleId` is in the list.
    ands.push({
      roleAssignments: {
        some: { revokedAt: null, roleId: { in: opts.roleIds } },
      },
    })
  }
  if (opts.statuses && opts.statuses.length > 0) {
    const statusOrs: Prisma.UserWhereInput[] = []
    for (const status of opts.statuses) {
      if (status === "active") {
        statusOrs.push({ disabledAt: null, deletedAt: null })
      } else if (status === "disabled") {
        statusOrs.push({ disabledAt: { not: null } })
      } else if (status === "pending-deletion") {
        statusOrs.push({ deletedAt: { not: null } })
      }
    }
    if (statusOrs.length > 0) ands.push({ OR: statusOrs })
  }
  if (opts.emailVerified === true) {
    ands.push({ emailVerifiedAt: { not: null } })
  } else if (opts.emailVerified === false) {
    ands.push({ emailVerifiedAt: null })
  }
  if (opts.joinedAfter) {
    ands.push({ createdAt: { gte: opts.joinedAfter } })
  }
  const where: Prisma.UserWhereInput = ands.length === 1 ? ands[0]! : { AND: ands }
  // Fetch limit+1 ; the extra row tells us if there's another page.
  const rows = await db.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > opts.limit
  const items = hasMore ? rows.slice(0, opts.limit) : rows
  const nextCursor = hasMore ? items[items.length - 1]!.id : null
  return { items, nextCursor }
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const db = getDb()
  return db.user.findUnique({ where: { email } })
}

export async function updateProfileData(
  id: string,
  patch: {
    displayName?: string | null
    avatarUrl?: string | null
    bannerUrl?: string | null
    bio?: string | null
    localePreference?: string
  },
): Promise<UserRow> {
  const db = getDb()
  return db.user.update({ where: { id }, data: patch })
}

export async function updateEmail(id: string, email: string): Promise<UserRow> {
  const db = getDb()
  return db.user.update({ where: { id }, data: { email } })
}

export async function setDeletedAt(
  id: string,
  deletedAt: Date | null,
): Promise<UserRow> {
  const db = getDb()
  return db.user.update({ where: { id }, data: { deletedAt } })
}
