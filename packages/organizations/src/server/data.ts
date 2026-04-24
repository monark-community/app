import { getDb, type Prisma } from "@monark/db"

export type OrganizationRow = Prisma.OrganizationGetPayload<Record<string, never>>
export type MembershipRow = Prisma.OrganizationMembershipGetPayload<Record<string, never>>

export async function findById(id: string): Promise<OrganizationRow | null> {
  const db = getDb()
  return db.organization.findUnique({ where: { id } })
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
