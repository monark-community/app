import { NotFoundError } from "@monark/common";
import {
  countActiveOrganizations,
  findById,
  findBySlug,
  findOnlyActiveOrganization,
  findOrgsForUser,
  isMember,
  type OrganizationRow,
} from "./data";

export type Organization = OrganizationRow;

export type OrgSessionContext = {
  userId: string | null;
  activeOrganizationId: string | null;
};

export async function getById(id: string): Promise<Organization | null> {
  return findById(id);
}

export async function getByIdOrThrow(id: string): Promise<Organization> {
  const org = await findById(id);
  if (!org) throw new NotFoundError("Organization", id);
  return org;
}

export async function getBySlug(slug: string): Promise<Organization | null> {
  return findBySlug(slug);
}

export async function getUserOrgs(userId: string): Promise<Organization[]> {
  return findOrgsForUser(userId);
}

// Returns the active org for a session.
//
// When the session carries an `active_organization_id` claim, that
// drives it, validating that the user still has a live membership. A
// stale claim (user was removed from the org) returns null.
//
// There's only ever one org, so the claim is usually dead weight ;
// we fall back to the singleton for any signed-in caller
// (sysadmins, dev users without a formal Membership row, anyone the
// session metadata never got populated for). Without this fallback,
// `current.useQuery` would forever return null in dev — which is
// what bit the dev overlay panel.
export async function getCurrentOrg(ctx: OrgSessionContext): Promise<Organization | null> {
  if (!ctx.userId) return null;
  if (ctx.activeOrganizationId) {
    const alive = await isMember(ctx.userId, ctx.activeOrganizationId);
    if (!alive) return null;
    return findById(ctx.activeOrganizationId);
  }
  if ((await countActiveOrganizations()) !== 1) return null;
  return findOnlyActiveOrganization();
}

export async function requireOrg(ctx: OrgSessionContext): Promise<Organization> {
  const org = await getCurrentOrg(ctx);
  if (!org) throw new NotFoundError("Organization", ctx.activeOrganizationId ?? "active");
  return org;
}
