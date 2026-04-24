import { NotFoundError } from "@monark/common"
import { findById, findBySlug, findOrgsForUser, isMember, type OrganizationRow } from "./data"

export type Organization = OrganizationRow

export type OrgSessionContext = {
  userId: string | null
  activeOrganizationId: string | null
}

export async function getById(id: string): Promise<Organization | null> {
  return findById(id)
}

export async function getByIdOrThrow(id: string): Promise<Organization> {
  const org = await findById(id)
  if (!org) throw new NotFoundError("Organization", id)
  return org
}

export async function getBySlug(slug: string): Promise<Organization | null> {
  return findBySlug(slug)
}

export async function getUserOrgs(userId: string): Promise<Organization[]> {
  return findOrgsForUser(userId)
}

// Returns the active org for a session, validating that the user still has a
// live membership. If the session carries a stale org_id (user was removed),
// returns null so the caller can route them to the org switcher.
export async function getCurrentOrg(ctx: OrgSessionContext): Promise<Organization | null> {
  if (!ctx.userId || !ctx.activeOrganizationId) return null
  const alive = await isMember(ctx.userId, ctx.activeOrganizationId)
  if (!alive) return null
  return findById(ctx.activeOrganizationId)
}

export async function requireOrg(ctx: OrgSessionContext): Promise<Organization> {
  const org = await getCurrentOrg(ctx)
  if (!org) throw new NotFoundError("Organization", ctx.activeOrganizationId ?? "active")
  return org
}
