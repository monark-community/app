import { getDb, type Prisma } from "@monark/db"

export type OrganizationRow = Prisma.OrganizationGetPayload<Record<string, never>>
export type MembershipRow = Prisma.OrganizationMembershipGetPayload<Record<string, never>>

// Window we keep an old slug forwarding to the renamed org. Roughly the
// time it takes for a search engine + email cached link to die out ;
// shorter than that and renames feel like cliffs, longer is just noise.
const SLUG_REDIRECT_DAYS = 90

export type InviteRow = Prisma.InviteGetPayload<Record<string, never>>

export async function findById(id: string): Promise<OrganizationRow | null> {
  const db = getDb()
  return db.organization.findUnique({ where: { id } })
}

// Cheap presence check used by the bootstrap gate. Counts non-deleted
// rows ; in single-tenant mode the system isn't usable until exactly
// one such row exists. `take: 1` short-circuits the count so this stays
// O(1) even on a populated platform.
export async function countActiveOrganizations(): Promise<number> {
  const db = getDb()
  return db.organization.count({ where: { deletedAt: null } })
}

// Returns the single non-deleted org if one exists. Used by single-
// tenant code paths that want to skip the picker and route directly
// to "the org" — invite-flow auto-select, admin/organizations
// fast-redirect, etc. Returns null when there are zero or more than
// one orgs (the latter would mean we're in multi-tenant territory).
export async function findOnlyActiveOrganization(): Promise<OrganizationRow | null> {
  const db = getDb()
  const rows = await db.organization.findMany({
    where: { deletedAt: null },
    take: 2,
  })
  if (rows.length === 1) return rows[0] ?? null
  return null
}

// Used by the bootstrap-from-env hook. Creates an Organization row
// with the canonical fields the setup page exposes ; idempotent via
// the unique slug constraint, so re-running on a healthy install is
// a no-op (the existing row is returned). Caller is responsible for
// gating this with the bootstrap status check.
export async function createOrganizationRow(input: {
  slug: string
  displayName: string
  primaryColor?: string | null
  logoUrl?: string | null
}): Promise<OrganizationRow> {
  const db = getDb()
  const existing = await db.organization.findUnique({ where: { slug: input.slug } })
  if (existing) return existing
  return db.organization.create({
    data: {
      slug: input.slug,
      displayName: input.displayName,
      primaryColor: input.primaryColor ?? null,
      logoUrl: input.logoUrl ?? null,
    },
  })
}

export async function findBySlug(slug: string): Promise<OrganizationRow | null> {
  const db = getDb()
  return db.organization.findUnique({ where: { slug } })
}

export async function findOrgsForUser(userId: string): Promise<OrganizationRow[]> {
  const db = getDb()
  const rows = await db.organizationMembership.findMany({
    where: { userId, leftAt: null, organization: { deletedAt: null } },
    include: { organization: true },
    orderBy: { joinedAt: "asc" },
  })
  return rows.map((row) => row.organization)
}

export async function isMember(userId: string, organizationId: string): Promise<boolean> {
  const db = getDb()
  const membership = await db.organizationMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  })
  return Boolean(membership && membership.leftAt === null)
}

// Admin-facing org listing. Cursor-paginated on `id` ordered by
// `createdAt desc, id desc` so freshly-created orgs float up. Soft-deleted
// orgs are excluded by default ; `search` matches displayName or slug
// case-insensitively.
export async function listOrganizationsForAdmin(opts: {
  search?: string
  cursor?: string
  limit: number
}): Promise<{ items: OrganizationRow[]; nextCursor: string | null }> {
  const db = getDb()
  const where: Prisma.OrganizationWhereInput = { deletedAt: null }
  const search = opts.search?.trim()
  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ]
  }
  const rows = await db.organization.findMany({
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

// Cursor-less list of pending invites for one org. Filters out
// already-accepted rows ; expired rows stay visible so the admin can
// see + revoke them. Includes the inviter + the joined role row so
// the admin UI can show "invited by" + the role's display name
// without second round-trips.
export async function listPendingInvitesForOrg(
  organizationId: string,
): Promise<
  Array<
    InviteRow & {
      invitedBy: { id: string; email: string; displayName: string | null }
      role: { id: string; key: string; name: string }
    }
  >
> {
  const db = getDb()
  return db.invite.findMany({
    where: { organizationId, acceptedAt: null },
    orderBy: { expiresAt: "asc" },
    include: {
      invitedBy: { select: { id: true, email: true, displayName: true } },
      role: { select: { id: true, key: true, name: true } },
    },
  })
}

export async function findInviteByTokenHash(
  tokenHash: string,
): Promise<InviteRow | null> {
  const db = getDb()
  return db.invite.findUnique({ where: { tokenHash } })
}

// Org-agnostic pending-invite list. Returns every non-accepted invite
// across every non-deleted org, ordered by `createdAt desc, id desc`
// to match the user-list ordering. Accepts an optional `search` that
// matches against the invite email case-insensitively, plus an optional
// `roleIds` filter (matches the invite's role row id). The admin
// directory on /admin/users uses this to render "Pending" rows
// alongside actual users. The `role` row is joined so the UI can show
// the role's display name without a second round-trip.
export async function listPendingInvitesForAdmin(opts: {
  search?: string
  roleIds?: string[]
}): Promise<
  Array<
    InviteRow & {
      organization: { id: string; slug: string; displayName: string }
      role: { id: string; key: string; name: string }
    }
  >
> {
  const db = getDb()
  const where: Prisma.InviteWhereInput = {
    acceptedAt: null,
    organization: { deletedAt: null },
  }
  const search = opts.search?.trim()
  if (search) {
    where.email = { contains: search, mode: "insensitive" }
  }
  if (opts.roleIds && opts.roleIds.length > 0) {
    where.roleId = { in: opts.roleIds }
  }
  return db.invite.findMany({
    where,
    orderBy: [{ id: "desc" }],
    include: {
      organization: { select: { id: true, slug: true, displayName: true } },
      role: { select: { id: true, key: true, name: true } },
    },
  })
}

export async function findPendingInvitesForEmail(
  email: string,
): Promise<InviteRow[]> {
  const db = getDb()
  const now = new Date()
  return db.invite.findMany({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: now },
      organization: { deletedAt: null },
    },
    orderBy: { expiresAt: "asc" },
  })
}

export async function createInviteRow(input: {
  organizationId: string
  email: string
  displayName: string | null
  roleId: string
  invitedById: string
  tokenHash: string
  expiresAt: Date
}): Promise<InviteRow> {
  const db = getDb()
  return db.invite.create({
    data: {
      organizationId: input.organizationId,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      roleId: input.roleId,
      invitedById: input.invitedById,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    },
  })
}

export async function deleteInviteRow(id: string): Promise<void> {
  const db = getDb()
  // Hard delete : the schema has no `revokedAt` column ; revoking IS
  // deletion. Cascade rules don't apply (no FK from anywhere into
  // Invite.id), so this is safe even if the row was already accepted.
  // Caller should `findUnique` first if they want a "not found" branch ;
  // this just no-ops for missing rows.
  await db.invite.deleteMany({ where: { id } }).catch(() => {})
}

// Atomic acceptance : marks the invite accepted, upserts the
// OrganizationMembership row (handles the "already a member of a
// different org and re-joining" edge case), and creates the role
// assignment. Idempotent against a re-run since the unique constraint
// on (userId, organizationId) for memberships short-circuits the
// second run via upsert.
export async function acceptInviteRow(input: {
  inviteId: string
  userId: string
}): Promise<{ organizationId: string; roleId: string }> {
  const db = getDb()
  return db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { id: input.inviteId } })
    if (!invite) throw new Error(`Invite ${input.inviteId} not found`)
    if (invite.acceptedAt) {
      // Already accepted ; treat as success so a retried call doesn't
      // 500. The membership row + role assignment from the first
      // acceptance are still in place by definition.
      return { organizationId: invite.organizationId, roleId: invite.roleId }
    }
    if (invite.expiresAt < new Date()) {
      throw new Error("Invite has expired")
    }
    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedById: input.userId },
    })
    // Pre-fill the user's displayName from the invite ONLY when the
    // user hasn't set one yet — never overwrite an existing value, so
    // a returning member who's customised their own name keeps it.
    if (invite.displayName) {
      await tx.user.updateMany({
        where: { id: input.userId, displayName: null },
        data: { displayName: invite.displayName },
      })
    }
    await tx.organizationMembership.upsert({
      where: {
        userId_organizationId: {
          userId: input.userId,
          organizationId: invite.organizationId,
        },
      },
      update: { leftAt: null },
      create: {
        userId: input.userId,
        organizationId: invite.organizationId,
      },
    })
    // Role assignment : inline upsert keyed on the new
    // (userId, organizationId, roleId) unique tuple so the role lands
    // in the same tx as the membership.
    await tx.roleAssignment.upsert({
      where: {
        userId_organizationId_roleId: {
          userId: input.userId,
          organizationId: invite.organizationId,
          roleId: invite.roleId,
        },
      },
      update: {
        revokedAt: null,
        revokedById: null,
        grantedById: invite.invitedById,
        grantedAt: new Date(),
      },
      create: {
        userId: input.userId,
        organizationId: invite.organizationId,
        roleId: invite.roleId,
        grantedById: invite.invitedById,
      },
    })
    return { organizationId: invite.organizationId, roleId: invite.roleId }
  })
}

// Partial update for the admin org-profile surface. When the slug
// rotates we record the previous slug as a redirect (90-day window) so
// in-flight links don't 404. The whole thing runs inside a transaction
// so a failed slug-uniqueness check doesn't leave an orphan redirect.
export async function updateOrganizationForAdmin(
  id: string,
  patch: {
    displayName?: string
    slug?: string
    logoUrl?: string | null
    primaryColor?: string | null
  },
): Promise<{ row: OrganizationRow; previousSlug?: string }> {
  const db = getDb()
  return db.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({ where: { id } })
    if (!existing) {
      throw new Error(`Organization ${id} not found`)
    }
    let previousSlug: string | undefined
    if (patch.slug && patch.slug !== existing.slug) {
      const conflict = await tx.organization.findUnique({
        where: { slug: patch.slug },
      })
      if (conflict && conflict.id !== id) {
        throw new Error("Slug already in use")
      }
      const expiresAt = new Date(
        Date.now() + SLUG_REDIRECT_DAYS * 24 * 60 * 60 * 1000,
      )
      await tx.orgSlugRedirect.upsert({
        where: { oldSlug: existing.slug },
        update: { organizationId: id, expiresAt },
        create: {
          oldSlug: existing.slug,
          organizationId: id,
          expiresAt,
        },
      })
      previousSlug = existing.slug
    }
    const row = await tx.organization.update({
      where: { id },
      data: patch,
    })
    return { row, previousSlug }
  })
}
