import { createHash } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { ADMIN_ROLE_KEY } from "@monark/rbac/server";
import { NotFoundError, ValidationError } from "@monark/common";
import {
  acceptInviteByToken,
  consumePendingInvitesForUser,
  createInvite,
  revokeInvite,
} from "../../src/server/invites";

// Integration tests for the invite lifecycle. Three load-bearing
// guarantees on this surface :
//
//   1. The plaintext invite token is NEVER persisted ; only its
//      SHA-256 hash lands on `Invite.tokenHash`. Recipients hold the
//      plaintext via the email link only.
//   2. Acceptance is atomic : invite → accepted, OrganizationMembership
//      upserted, RoleAssignment created, all in one transaction. A
//      crash mid-way leaves either none-of-it or all-of-it, never
//      partial state.
//   3. `consumePendingInvitesForUser` is idempotent across multiple
//      pending invites for the same email — every match applies, a
//      single failure doesn't block siblings.
//
// `sendMail` is left unconfigured (no `SMTP_URL` env) so it
// short-circuits to a log-only success, the same pattern the
// notifications dispatch integration uses.

const ORG_A = "test-org-invites-a";
const ORG_B = "test-org-invites-b";

beforeAll(async () => {
  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  // Built-in ADMIN role at platform tier (organizationId=null) — invites
  // need a Role row to point at. Built-in roles are assignable across
  // every org via the `role.builtIn === true` branch in `createInvite`.
  // Find-or-create instead of upsert because Prisma rejects null in
  // compound-unique `where` clauses ; the `@@unique([key,
  // organizationId])` constraint includes a nullable column.
  const existingAdmin = await db.role.findFirst({
    where: { key: ADMIN_ROLE_KEY, organizationId: null },
    select: { id: true },
  });
  if (!existingAdmin) {
    await db.role.create({
      data: {
        key: ADMIN_ROLE_KEY,
        name: "Administrator",
        builtIn: true,
        organizationId: null,
      },
    });
  }
});

afterEach(async () => {
  const db = getDb();
  // Order matters : invites + memberships + assignments reference users
  // via FKs ; clear the dependents before users themselves.
  await db.invite.deleteMany({});
  await db.roleAssignment.deleteMany({});
  await db.organizationMembership.deleteMany({});
  await db.user.deleteMany({});
});

async function seedUser(id: string, email = `${id}@test.local`): Promise<string> {
  const db = getDb();
  const row = await db.user.create({ data: { id, email } });
  return row.id;
}

function tokenHash(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

async function findAdminRoleId(): Promise<string> {
  const db = getDb();
  const row = await db.role.findFirst({
    where: { key: ADMIN_ROLE_KEY, organizationId: null },
    select: { id: true },
  });
  if (!row) throw new Error("ADMIN role missing in seed");
  return row.id;
}

describe("organizations/invites createInvite", () => {
  it("persists only the SHA-256 token hash, never the plaintext", async () => {
    const inviter = await seedUser("u-inviter-1");
    const adminRoleId = await findAdminRoleId();
    const result = await createInvite({
      organizationId: ORG_A,
      email: "newcomer@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    const db = getDb();
    const row = await db.invite.findUnique({ where: { id: result.inviteId } });
    expect(row).toBeDefined();
    expect(row!.tokenHash).toBe(tokenHash(result.token));
    // Quadruple-check : the plaintext token must not appear in any
    // string column of the row.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(result.token);
  });

  it("normalizes email to lowercase + trim", async () => {
    const inviter = await seedUser("u-inviter-2");
    const adminRoleId = await findAdminRoleId();
    const result = await createInvite({
      organizationId: ORG_A,
      email: "  Mixed.Case@Example.Test  ",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    expect(result.email).toBe("mixed.case@example.test");
  });

  it("rejects an invalid email shape with ValidationError", async () => {
    const inviter = await seedUser("u-inviter-3");
    const adminRoleId = await findAdminRoleId();
    await expect(
      createInvite({
        organizationId: ORG_A,
        email: "not-an-email",
        displayName: null,
        roleId: adminRoleId,
        invitedById: inviter,
        appUrl: "https://app.test",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown organizationId with NotFoundError", async () => {
    const inviter = await seedUser("u-inviter-4");
    const adminRoleId = await findAdminRoleId();
    await expect(
      createInvite({
        organizationId: "does-not-exist",
        email: "x@y.test",
        displayName: null,
        roleId: adminRoleId,
        invitedById: inviter,
        appUrl: "https://app.test",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns a sign-up URL pointing at /signup with the plaintext token", async () => {
    const inviter = await seedUser("u-inviter-5");
    const adminRoleId = await findAdminRoleId();
    const result = await createInvite({
      organizationId: ORG_A,
      email: "x@y.test",
      displayName: "Alice Anderson",
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test/",
    });
    expect(result.signUpUrl).toBe(`https://app.test/signup?invite=${result.token}`);
    expect(result.displayName).toBe("Alice Anderson");
  });

  it("stamps an expiresAt 14 days out", async () => {
    const inviter = await seedUser("u-inviter-6");
    const adminRoleId = await findAdminRoleId();
    const before = Date.now();
    const result = await createInvite({
      organizationId: ORG_A,
      email: "x@y.test",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + fourteenDays - 1000);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + fourteenDays + 1000);
  });
});

describe("organizations/invites acceptInviteByToken", () => {
  it("accepts a valid token : creates membership + role assignment in one transaction", async () => {
    const inviter = await seedUser("u-inviter-accept-1");
    const adminRoleId = await findAdminRoleId();
    const invite = await createInvite({
      organizationId: ORG_A,
      email: "joiner@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    const joiner = await seedUser("u-joiner", "joiner@test.local");
    const result = await acceptInviteByToken(invite.token, joiner);
    expect(result.organizationId).toBe(ORG_A);
    expect(result.roleId).toBe(adminRoleId);

    const db = getDb();
    const membership = await db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: joiner,
          organizationId: ORG_A,
        },
      },
    });
    expect(membership).not.toBeNull();
    const assignment = await db.roleAssignment.findFirst({
      where: { userId: joiner, organizationId: ORG_A, roleId: adminRoleId },
    });
    expect(assignment).not.toBeNull();
    const inviteRow = await db.invite.findUnique({
      where: { id: invite.inviteId },
    });
    expect(inviteRow!.acceptedAt).toBeInstanceOf(Date);
    expect(inviteRow!.acceptedById).toBe(joiner);
  });

  it("rejects an unknown token with NotFoundError", async () => {
    const joiner = await seedUser("u-joiner-unknown");
    await expect(acceptInviteByToken("0".repeat(64), joiner)).rejects.toThrow(NotFoundError);
  });

  it("rejects an expired invite with ValidationError", async () => {
    const inviter = await seedUser("u-inviter-expired");
    const adminRoleId = await findAdminRoleId();
    const invite = await createInvite({
      organizationId: ORG_A,
      email: "expired@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    // Backdate the row to expired.
    const db = getDb();
    await db.invite.update({
      where: { id: invite.inviteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const joiner = await seedUser("u-expired-joiner", "expired@test.local");
    await expect(acceptInviteByToken(invite.token, joiner)).rejects.toThrow(ValidationError);
  });

  it("is idempotent on a second accept of an already-accepted invite", async () => {
    const inviter = await seedUser("u-inviter-idem");
    const adminRoleId = await findAdminRoleId();
    const invite = await createInvite({
      organizationId: ORG_A,
      email: "idem@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    const joiner = await seedUser("u-idem-joiner", "idem@test.local");
    const first = await acceptInviteByToken(invite.token, joiner);
    const second = await acceptInviteByToken(invite.token, joiner);
    expect(second).toEqual(first);
    // Both calls land at the same membership/assignment row count ;
    // the second isn't a no-op-error, it returns the same shape.
    const db = getDb();
    const memberships = await db.organizationMembership.count({
      where: { userId: joiner, organizationId: ORG_A },
    });
    expect(memberships).toBe(1);
  });

  it("pre-fills displayName ONLY when the user has none set", async () => {
    const inviter = await seedUser("u-inviter-name");
    const adminRoleId = await findAdminRoleId();
    const inviteWithName = await createInvite({
      organizationId: ORG_A,
      email: "named@test.local",
      displayName: "From Invite",
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    const joiner = await seedUser("u-named-joiner", "named@test.local");
    await acceptInviteByToken(inviteWithName.token, joiner);
    const db = getDb();
    const after = await db.user.findUnique({
      where: { id: joiner },
      select: { displayName: true },
    });
    expect(after!.displayName).toBe("From Invite");
  });

  it("does NOT overwrite an existing displayName", async () => {
    const inviter = await seedUser("u-inviter-name-2");
    const adminRoleId = await findAdminRoleId();
    const invite = await createInvite({
      organizationId: ORG_A,
      email: "preserve@test.local",
      displayName: "From Invite",
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    const joiner = await seedUser("u-preserve-joiner", "preserve@test.local");
    const db = getDb();
    await db.user.update({
      where: { id: joiner },
      data: { displayName: "User's Own Choice" },
    });
    await acceptInviteByToken(invite.token, joiner);
    const after = await db.user.findUnique({
      where: { id: joiner },
      select: { displayName: true },
    });
    expect(after!.displayName).toBe("User's Own Choice");
  });
});

describe("organizations/invites consumePendingInvitesForUser", () => {
  it("applies every pending invite matching the user's email", async () => {
    const inviter = await seedUser("u-multi-inviter");
    const adminRoleId = await findAdminRoleId();
    await createInvite({
      organizationId: ORG_A,
      email: "multi@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    await createInvite({
      organizationId: ORG_B,
      email: "multi@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    const joiner = await seedUser("u-multi-joiner", "multi@test.local");
    const result = await consumePendingInvitesForUser(joiner, "multi@test.local");
    expect(result.accepted).toBe(2);
    const db = getDb();
    const memberships = await db.organizationMembership.findMany({
      where: { userId: joiner },
      select: { organizationId: true },
    });
    expect(memberships.map((m) => m.organizationId).sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it("returns 0 when no pending invites match the email", async () => {
    const joiner = await seedUser("u-no-invites", "no-invites@test.local");
    const result = await consumePendingInvitesForUser(joiner, "no-invites@test.local");
    expect(result.accepted).toBe(0);
  });
});

describe("organizations/invites revokeInvite", () => {
  it("deletes the invite row so the token can no longer be accepted", async () => {
    const inviter = await seedUser("u-revoke-inviter");
    const adminRoleId = await findAdminRoleId();
    const invite = await createInvite({
      organizationId: ORG_A,
      email: "revoke@test.local",
      displayName: null,
      roleId: adminRoleId,
      invitedById: inviter,
      appUrl: "https://app.test",
    });
    await revokeInvite(invite.inviteId);
    const joiner = await seedUser("u-revoke-joiner", "revoke@test.local");
    await expect(acceptInviteByToken(invite.token, joiner)).rejects.toThrow(NotFoundError);
  });
});
