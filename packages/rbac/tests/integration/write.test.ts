import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { ValidationError, on } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import { ADMIN_ROLE_KEY, SYSADMIN_ROLE_KEY } from "../../src/contracts/role";
import { createCustomRole } from "../../src/server/data";
import { assignRole, revokeRole } from "../../src/server/write";

// Integration tests for the rbac write-side behaviour : assignment
// scope guards (built-in role tier + custom role org match), the
// `alreadyActive` idempotency contract that suppresses double event
// emission on retried grants, and the revoke path's event payload.
//
// Most of the guards are pure validation + DB writes ; the event
// assertions tap into the in-memory event bus via `on(...)` to
// capture every `rbac.role-*` emission. The bus is reset in
// `beforeAll` so a sibling spec's subscribers don't bleed into ours.

const ORG_A = "test-org-rbac-write-a";
const ORG_B = "test-org-rbac-write-b";

beforeEach(async () => {
  // Reset the event-bus subscriber list so a sibling spec's
  // captured handler doesn't leak into ours.
  _resetHandlersForTesting();

  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  await ensureBuiltInRole(SYSADMIN_ROLE_KEY, "System Administrator");
  await ensureBuiltInRole(ADMIN_ROLE_KEY, "Administrator");
});

// Find-or-create for built-in roles. We can't use `db.role.upsert`
// here because `@@unique([key, organizationId])` includes a nullable
// column ; Prisma rejects null in compound-unique `where` clauses
// even though Postgres null-distinct semantics let `(KEY, null)`
// coexist with `(KEY, "org_xxx")`. `findFirst({ organizationId:
// null })` works fine because the regular `where` shape allows null.
async function ensureBuiltInRole(key: string, name: string): Promise<void> {
  const db = getDb();
  const existing = await db.role.findFirst({
    where: { key, organizationId: null },
    select: { id: true },
  });
  if (existing) return;
  await db.role.create({
    data: { key, name, builtIn: true, organizationId: null },
  });
}

afterEach(async () => {
  // Order matters : `RoleAssignment_roleId_fkey` is ON DELETE
  // RESTRICT in the migration (despite the schema declaring
  // Cascade), so RoleAssignment has to clear before Role.
  const db = getDb();
  await db.roleAssignment.deleteMany({});
  await db.rolePermission.deleteMany({ where: { role: { builtIn: false } } });
  await db.role.deleteMany({ where: { builtIn: false } });
  await db.user.deleteMany({});
});

async function seedUser(id: string): Promise<string> {
  const db = getDb();
  const u = await db.user.create({
    data: { id, email: `${id}@test.local` },
  });
  return u.id;
}

async function findRoleByKey(key: string, orgId: string | null): Promise<string> {
  const db = getDb();
  const row = await db.role.findFirst({
    where: { key, organizationId: orgId },
    select: { id: true },
  });
  if (!row) throw new Error(`Role ${key}@${orgId ?? "platform"} missing`);
  return row.id;
}

/**
 * Captures every event emitted on the bus during the spec body. The
 * `_resetHandlersForTesting` call in `beforeEach` clears subscribers
 * between specs, so no per-spec dispose is needed — handlers are
 * scoped to the current spec body.
 */
function captureEvents(): Array<{ type: string; payload: unknown }> {
  const events: Array<{ type: string; payload: unknown }> = [];
  on("*", (event) => {
    events.push({ type: event.type, payload: event });
  });
  return events;
}

describe("rbac/write assignRole — scope guards", () => {
  it("rejects SYSADMIN with a non-null orgId", async () => {
    const userId = await seedUser("u-bad-sa");
    const sysadminRoleId = await findRoleByKey(SYSADMIN_ROLE_KEY, null);
    await expect(
      assignRole({
        userId,
        roleId: sysadminRoleId,
        organizationId: ORG_A,
        grantedById: null,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects ADMIN with a null orgId (must be org-tier)", async () => {
    const userId = await seedUser("u-bad-admin");
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null);
    await expect(
      assignRole({
        userId,
        roleId: adminRoleId,
        organizationId: null,
        grantedById: null,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a custom role granted at the wrong org", async () => {
    const userId = await seedUser("u-cross-org");
    const role = await createCustomRole({
      organizationId: ORG_A,
      key: "moderator-cross",
      name: "Moderator",
      description: null,
      color: null,
      permissions: [],
    });
    await expect(
      assignRole({
        userId,
        roleId: role.id,
        organizationId: ORG_B,
        grantedById: null,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts SYSADMIN at platform tier", async () => {
    const userId = await seedUser("u-good-sa");
    const sysadminRoleId = await findRoleByKey(SYSADMIN_ROLE_KEY, null);
    const result = await assignRole({
      userId,
      roleId: sysadminRoleId,
      organizationId: null,
      grantedById: null,
    });
    expect(result.assignmentId).toBeDefined();
    expect(result.alreadyActive).toBe(false);
  });

  it("accepts ADMIN at the right org", async () => {
    const userId = await seedUser("u-good-admin");
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null);
    const result = await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
    });
    expect(result.assignmentId).toBeDefined();
  });
});

describe("rbac/write assignRole — alreadyActive idempotency", () => {
  it("returns alreadyActive=true on a re-grant of an existing active assignment", async () => {
    const userId = await seedUser("u-idem");
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null);
    const first = await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
    });
    const second = await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
    });
    expect(first.alreadyActive).toBe(false);
    expect(second.alreadyActive).toBe(true);
    expect(second.assignmentId).toBe(first.assignmentId);
  });

  it("does NOT re-emit `rbac.role-assigned` on an already-active grant", async () => {
    const userId = await seedUser("u-no-double");
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null);
    const events = captureEvents();
    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
    });
    // The first emission should have landed.
    expect(events.filter((e) => e.type === "rbac.role-assigned")).toHaveLength(1);

    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
    });
    // Still one — the retry was a no-op for events.
    expect(events.filter((e) => e.type === "rbac.role-assigned")).toHaveLength(1);
  });

  it("emits `rbac.role-assigned` with the right payload shape on first grant", async () => {
    const userId = await seedUser("u-payload");
    // `grantedById` is a FK to User ; seed the actor so the
    // RoleAssignment row passes the constraint.
    await seedUser("actor-1");
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null);
    const events = captureEvents();
    const result = await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: "actor-1",
      reason: "first-time",
    });
    const event = events.find((e) => e.type === "rbac.role-assigned") as
      | { type: string; payload: Record<string, unknown> }
      | undefined;
    expect(event).toBeDefined();
    expect(event!.payload.assignmentId).toBe(result.assignmentId);
    expect(event!.payload.userId).toBe(userId);
    expect(event!.payload.organizationId).toBe(ORG_A);
    expect(event!.payload.roleId).toBe(adminRoleId);
    expect(event!.payload.roleKey).toBe(ADMIN_ROLE_KEY);
    expect(event!.payload.grantedById).toBe("actor-1");
    expect(event!.payload.reason).toBe("first-time");
    expect(event!.payload.occurredAt).toBeInstanceOf(Date);
  });
});

describe("rbac/write revokeRole", () => {
  it("clears the assignment and emits `rbac.role-revoked`", async () => {
    const userId = await seedUser("u-revoke");
    // `revokedById` is a FK to User ; seed the actor so the update
    // passes the constraint.
    await seedUser("actor-2");
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null);
    const granted = await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
    });
    const events = captureEvents();
    await revokeRole(granted.assignmentId, "actor-2", "test revoke");
    const event = events.find((e) => e.type === "rbac.role-revoked") as
      | { type: string; payload: Record<string, unknown> }
      | undefined;
    expect(event).toBeDefined();
    expect(event!.payload.assignmentId).toBe(granted.assignmentId);
    expect(event!.payload.userId).toBe(userId);
    expect(event!.payload.organizationId).toBe(ORG_A);
    expect(event!.payload.roleKey).toBe(ADMIN_ROLE_KEY);
    expect(event!.payload.revokedById).toBe("actor-2");
    expect(event!.payload.reason).toBe("test revoke");

    const db = getDb();
    const row = await db.roleAssignment.findUnique({
      where: { id: granted.assignmentId },
    });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.revokedById).toBe("actor-2");
  });

  it("is a no-op when the assignment doesn't exist (no event, no throw)", async () => {
    const events = captureEvents();
    await revokeRole("does-not-exist", null);
    expect(events.filter((e) => e.type === "rbac.role-revoked")).toHaveLength(0);
  });
});
