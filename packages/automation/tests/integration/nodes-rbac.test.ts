import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import type { DomainEvent } from "@monark/common/contracts/events";
import { assignRole, createRole } from "@monark/rbac/server";
import { rbacAssignRoleNode, rbacRemoveRoleNode } from "../../src/server/nodes/rbac";
import type { NodeExecutionContext } from "../../src/server/registry";

// The Assign Role / Remove Role automation nodes, driven through their real
// `run` (config parse + execute) against a real Postgres. Proves the owner
// permission re-check (`requireOwnerPermission` in nodes/shared.ts) gates the
// action, the by-key role resolution, and the assign/revoke round-trip + the
// idempotent "already active" output. A run acts as its owner, so an owner who
// couldn't assign the role by hand can't via a node either.

const ORG = "auto-rbac-org";
const OWNER = "auto-rbac-owner"; // ADMIN → short-circuits every permission
const TARGET = "auto-rbac-target"; // receives the role
const PLAIN = "auto-rbac-plain"; // member, no role → owner-permission-denied case
const ADMIN_BUILTIN_ID = "role_admin_builtin";
const ALL_USERS = [OWNER, TARGET, PLAIN];

let editorRoleId = "";

async function cleanup() {
  const db = getDb();
  await db.roleAssignment.deleteMany({ where: { userId: { in: ALL_USERS } } });
  await db.rolePermission.deleteMany({ where: { role: { organizationId: ORG, builtIn: false } } });
  await db.role.deleteMany({ where: { organizationId: ORG, builtIn: false } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
}

function makeCtx(over: Partial<NodeExecutionContext> = {}): NodeExecutionContext {
  return {
    organizationId: ORG,
    actorUserId: OWNER,
    triggerEvent: {
      type: "automation.run-started",
      occurredAt: new Date(),
    } as unknown as DomainEvent,
    runId: "run-1",
    automationId: "auto-1",
    upstream: {},
    log: () => {},
    activateOutputs: () => {},
    suspend: () => {},
    getSecret: async () => null,
    ...over,
  };
}

beforeAll(async () => {
  const db = getDb();
  await cleanup();
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  // Built-in ADMIN at its sentinel id (hermetic — a sibling suite may have
  // truncated the shared Role table).
  await db.role.upsert({
    where: { id: ADMIN_BUILTIN_ID },
    create: {
      id: ADMIN_BUILTIN_ID,
      key: "ADMIN",
      name: "Administrator",
      builtIn: true,
      organizationId: null,
    },
    update: {},
  });
  await assignRole({
    userId: OWNER,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
  const editor = await createRole({
    organizationId: ORG,
    key: "editor",
    name: "Editor",
    createdById: OWNER,
  });
  editorRoleId = editor.id;
});

beforeEach(async () => {
  // Each test starts with the target holding no roles.
  await getDb().roleAssignment.deleteMany({ where: { userId: TARGET } });
});

afterAll(cleanup);

describe("rbacAssignRoleNode", () => {
  it("grants the role by key and reports alreadyActive on a repeat", async () => {
    const first = (await rbacAssignRoleNode.run(makeCtx(), {
      userId: TARGET,
      roleKey: "editor",
    })) as { assignmentId: string; alreadyActive: boolean };
    expect(first.alreadyActive).toBe(false);
    const row = await getDb().roleAssignment.findFirst({
      where: { userId: TARGET, roleId: editorRoleId, revokedAt: null },
    });
    expect(row).not.toBeNull();

    const second = (await rbacAssignRoleNode.run(makeCtx(), {
      userId: TARGET,
      roleKey: "editor",
    })) as { alreadyActive: boolean };
    expect(second.alreadyActive).toBe(true);
  });

  it("throws when the role key doesn't exist in the org", async () => {
    await expect(
      rbacAssignRoleNode.run(makeCtx(), { userId: TARGET, roleKey: "ghost" }),
    ).rejects.toThrow(/no grantable role/i);
  });

  it("denies when the automation owner lacks rbac.assign-role", async () => {
    await expect(
      rbacAssignRoleNode.run(makeCtx({ actorUserId: PLAIN }), {
        userId: TARGET,
        roleKey: "editor",
      }),
    ).rejects.toThrow(/lacks the "rbac.assign-role"/i);
  });

  it("denies when the run has no owner", async () => {
    await expect(
      rbacAssignRoleNode.run(makeCtx({ actorUserId: null }), { userId: TARGET, roleKey: "editor" }),
    ).rejects.toThrow(/requires an automation owner/i);
  });
});

describe("rbacRemoveRoleNode", () => {
  it("revokes an active role by key", async () => {
    await rbacAssignRoleNode.run(makeCtx(), { userId: TARGET, roleKey: "editor" });
    const res = (await rbacRemoveRoleNode.run(makeCtx(), {
      userId: TARGET,
      roleKey: "editor",
    })) as { revoked: boolean; roleKey: string };
    expect(res).toEqual({ revoked: true, roleKey: "editor" });
    const active = await getDb().roleAssignment.findFirst({
      where: { userId: TARGET, roleId: editorRoleId, revokedAt: null },
    });
    expect(active).toBeNull();
  });

  it("throws when the user has no active role of that key", async () => {
    await expect(
      rbacRemoveRoleNode.run(makeCtx(), { userId: TARGET, roleKey: "editor" }),
    ).rejects.toThrow(/no active "editor" role/i);
  });
});
