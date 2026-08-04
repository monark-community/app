import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { NotFoundError, ValidationError, on } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import { ADMIN_ROLE_KEY } from "../../src/contracts/role";
import {
  registerPermissions,
  _resetPermissionRegistryForTesting,
} from "../../src/contracts/permissions";
import { assignRole, createRole, deleteRole, updateRole } from "../../src/server/write";

// The write.ts role-CRUD wrappers layer validation (`validateRoleKey` /
// name-length / `validateColor` / `validatePermissionList`) and domain-event
// emission on top of the data.ts layer that role-crud.test.ts exercises
// directly. This spec drives the wrappers end-to-end : the validation gates,
// the `changed[]` diff that updateRole emits, the delete guards (built-in +
// in-use), and the assignRole branches write.test.ts doesn't reach.

const ORG_A = "test-org-rbac-crud-a";
const ORG_B = "test-org-rbac-crud-b";
const PERM = "rbactest.manage";

beforeEach(async () => {
  _resetHandlersForTesting();
  // The wrappers only import write.ts, so no module registers permissions ;
  // seed a known one so `validatePermissionList` has something to accept.
  _resetPermissionRegistryForTesting();
  registerPermissions("rbactest", {
    manage: { description: "Manage test things", category: "test" },
  });

  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  // A built-in role for the delete-guard + built-in-permissions-ignored paths.
  const existing = await db.role.findFirst({
    where: { key: ADMIN_ROLE_KEY, organizationId: null },
    select: { id: true },
  });
  if (!existing) {
    await db.role.create({
      data: { key: ADMIN_ROLE_KEY, name: "Administrator", builtIn: true, organizationId: null },
    });
  }
});

afterEach(async () => {
  // RoleAssignment before Role (FK is ON DELETE RESTRICT in the migration).
  const db = getDb();
  await db.roleAssignment.deleteMany({});
  await db.rolePermission.deleteMany({ where: { role: { builtIn: false } } });
  await db.role.deleteMany({ where: { builtIn: false } });
  await db.user.deleteMany({});
});

async function seedUser(id: string): Promise<string> {
  const u = await getDb().user.create({ data: { id, email: `${id}@test.local` } });
  return u.id;
}

async function adminRoleId(): Promise<string> {
  const row = await getDb().role.findFirstOrThrow({
    where: { key: ADMIN_ROLE_KEY, organizationId: null },
    select: { id: true },
  });
  return row.id;
}

function captureEvents(): Array<{ type: string; payload: Record<string, unknown> }> {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  on("*", (event) => events.push({ type: event.type, payload: event as Record<string, unknown> }));
  return events;
}

describe("rbac/write createRole", () => {
  it("creates a custom role, returns {id,key}, and emits rbac.role-created", async () => {
    const events = captureEvents();
    const res = await createRole({
      organizationId: ORG_A,
      key: "Moderator", // mixed case → normalised by validateRoleKey
      name: "  Moderator  ",
      description: "  handles reports  ",
      color: "#F0870C",
      createdById: "creator-1",
    });
    expect(res.key).toBe("moderator");

    const row = await getDb().role.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.name).toBe("Moderator");
    expect(row.color).toBe("#F0870C");
    expect(row.organizationId).toBe(ORG_A);

    const event = events.find((e) => e.type === "rbac.role-created");
    expect(event).toBeDefined();
    expect(event!.payload.roleId).toBe(res.id);
    expect(event!.payload.roleKey).toBe("moderator");
    expect(event!.payload.organizationId).toBe(ORG_A);
    expect(event!.payload.createdById).toBe("creator-1");
  });

  it("rejects an invalid role key", async () => {
    await expect(
      createRole({ organizationId: ORG_A, key: "a", name: "Too Short Key", createdById: "c" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a name outside 1–80 chars", async () => {
    await expect(
      createRole({ organizationId: ORG_A, key: "empty-name", name: "   ", createdById: "c" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createRole({
        organizationId: ORG_A,
        key: "long-name",
        name: "n".repeat(81),
        createdById: "c",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("stores a validated permission and rejects an unknown one", async () => {
    const res = await createRole({
      organizationId: ORG_A,
      key: "with-perms",
      name: "With perms",
      permissions: [PERM, PERM], // duplicate → de-duped
      createdById: "c",
    });
    const perms = await getDb().rolePermission.findMany({ where: { roleId: res.id } });
    expect(perms).toHaveLength(1);
    expect(perms[0]?.module).toBe("rbactest");
    expect(perms[0]?.permission).toBe("manage");

    await expect(
      createRole({
        organizationId: ORG_A,
        key: "bad-perms",
        name: "Bad perms",
        permissions: ["nope.nope"],
        createdById: "c",
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("rbac/write updateRole", () => {
  it("throws NotFoundError for a missing role", async () => {
    await expect(updateRole({ id: "does-not-exist", name: "x", actorId: "a" })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("patches name/description/color and emits role-updated with the changed set", async () => {
    const created = await createRole({
      organizationId: ORG_A,
      key: "editme",
      name: "Before",
      createdById: "c",
    });
    const events = captureEvents();
    await updateRole({
      id: created.id,
      name: "After",
      description: "now with a description",
      color: "#fff",
      actorId: "editor-1",
    });
    const row = await getDb().role.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.name).toBe("After");
    expect(row.description).toBe("now with a description");
    expect(row.color).toBe("#fff");

    const event = events.find((e) => e.type === "rbac.role-updated");
    expect(event).toBeDefined();
    expect(event!.payload.actorId).toBe("editor-1");
    expect(event!.payload.changed).toEqual(
      expect.arrayContaining(["name", "description", "color"]),
    );
  });

  it("replaces the permission set on a custom role", async () => {
    const created = await createRole({
      organizationId: ORG_A,
      key: "perm-swap",
      name: "Perm swap",
      createdById: "c",
    });
    await updateRole({ id: created.id, permissions: [PERM], actorId: "a" });
    const perms = await getDb().rolePermission.findMany({ where: { roleId: created.id } });
    expect(perms).toHaveLength(1);
  });

  it("ignores a permission list on a built-in role and no-ops when nothing else changed", async () => {
    const id = await adminRoleId();
    const events = captureEvents();
    await updateRole({ id, permissions: [PERM], actorId: "a" });
    // Built-in permissions are code-enforced, so the list is dropped ; with no
    // other field changing, updateRole short-circuits before emitting.
    expect(events.filter((e) => e.type === "rbac.role-updated")).toHaveLength(0);
    const perms = await getDb().rolePermission.findMany({ where: { roleId: id } });
    expect(perms).toHaveLength(0);
  });

  it("is a no-op (no event) when the submitted values match the current ones", async () => {
    const created = await createRole({
      organizationId: ORG_A,
      key: "same-values",
      name: "Same",
      createdById: "c",
    });
    const events = captureEvents();
    await updateRole({ id: created.id, name: "Same", actorId: "a" });
    expect(events.filter((e) => e.type === "rbac.role-updated")).toHaveLength(0);
  });
});

describe("rbac/write deleteRole", () => {
  it("throws NotFoundError for a missing role", async () => {
    await expect(deleteRole({ id: "does-not-exist", actorId: "a" })).rejects.toThrow(NotFoundError);
  });

  it("refuses to delete a built-in role", async () => {
    const id = await adminRoleId();
    await expect(deleteRole({ id, actorId: "a" })).rejects.toThrow(ValidationError);
  });

  it("refuses to delete a role that still has active assignments", async () => {
    const user = await seedUser("u-inuse");
    const created = await createRole({
      organizationId: ORG_A,
      key: "inuse",
      name: "In use",
      createdById: "c",
    });
    await assignRole({
      userId: user,
      roleId: created.id,
      organizationId: ORG_A,
      grantedById: null,
    });
    await expect(deleteRole({ id: created.id, actorId: "a" })).rejects.toThrow(ValidationError);
  });

  it("deletes an unused custom role and emits rbac.role-deleted", async () => {
    const created = await createRole({
      organizationId: ORG_A,
      key: "deleteme",
      name: "Delete me",
      createdById: "c",
    });
    const events = captureEvents();
    await deleteRole({ id: created.id, actorId: "actor-del" });
    expect(await getDb().role.findUnique({ where: { id: created.id } })).toBeNull();
    const event = events.find((e) => e.type === "rbac.role-deleted");
    expect(event).toBeDefined();
    expect(event!.payload.roleId).toBe(created.id);
    expect(event!.payload.actorId).toBe("actor-del");
  });
});

describe("rbac/write assignRole — extra branches", () => {
  it("throws NotFoundError when the role doesn't exist", async () => {
    const user = await seedUser("u-norole");
    await expect(
      assignRole({
        userId: user,
        roleId: "missing-role",
        organizationId: ORG_A,
        grantedById: null,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a custom role whose organizationId is null", async () => {
    const user = await seedUser("u-nullorg");
    // A malformed custom role (non-built-in, no org) — the guard rejects it.
    const role = await getDb().role.create({
      data: { key: "orphan-role", name: "Orphan", builtIn: false, organizationId: null },
    });
    await expect(
      assignRole({ userId: user, roleId: role.id, organizationId: null, grantedById: null }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts a custom role at its own org and emits rbac.role-assigned", async () => {
    const user = await seedUser("u-custom-ok");
    const created = await createRole({
      organizationId: ORG_A,
      key: "custom-ok",
      name: "Custom OK",
      createdById: "c",
    });
    const events = captureEvents();
    const res = await assignRole({
      userId: user,
      roleId: created.id,
      organizationId: ORG_A,
      grantedById: null,
    });
    expect(res.alreadyActive).toBe(false);
    const event = events.find((e) => e.type === "rbac.role-assigned");
    expect(event).toBeDefined();
    expect(event!.payload.roleKey).toBe("custom-ok");
    expect(event!.payload.organizationId).toBe(ORG_A);
  });
});
