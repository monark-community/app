import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { on, WILDCARD_EVENT_TYPE } from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { createBoard, listColumnsForBoard, setBoardRoleAccess } from "../../src/server/data";
import { registerKanbanPermissions } from "../../src/server/permissions";
import { kanbanRouter } from "../../src/server/index";

// Drives the REAL tRPC procedures (via a caller factory) to cover what the
// data-layer suite can't : the permission guards (`requirePermission` /
// `requireAccessibleBoard`), and the change-detection + domain-event emission in
// `cards.update` — a regression there is a privilege escalation, a cross-role
// board leak, or a broken automation/notification trigger. Mirrors the pattern
// in data-models' `authorization.test.ts` ; entirely self-contained in the
// module (no shared harness, no core changes).

const ORG = "kanban-router-org";
const U_EDITOR = "kr-editor"; // kanban.view/create/edit/delete
const U_VIEWER = "kr-viewer"; // kanban.view only
const U_OUTSIDER = "kr-outsider"; // member, no role
const U_GATED = "kr-gated"; // kanban.view + holds the restricted board's role
const U_ADMIN = "kr-admin"; // built-in ADMIN → kanban.manage (bypass)
const ADMIN_BUILTIN_ID = "role_admin_builtin"; // migration-seeded built-in ADMIN
const ALL_USERS = [U_EDITOR, U_VIEWER, U_OUTSIDER, U_GATED, U_ADMIN];
// Assignee userIds — distinct from the actor so `card-assigned` isn't a self-op.
const ASG_A = "kr-asg-a";
const ASG_B = "kr-asg-b";
const ASG_C = "kr-asg-c";

const createCaller = t.createCallerFactory(kanbanRouter);
const callerFor = (userId: string) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "kr-test" });

// Capture every emitted event ; each spec clears the buffer first (specs run in
// definition order). Filter helper narrows the union to the asserted type.
const captured: DomainEvent[] = [];
function eventsOfType<T extends DomainEvent["type"]>(type: T) {
  return captured.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
}

let openBoardId = "";
let restrictedBoardId = "";
let col0 = "";
let col1 = "";

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
  registerKanbanPermissions(); // so createRole accepts kanban.* keys

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    // requireOrg resolves the active org via membership.
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const editorRole = await createRole({
    organizationId: ORG,
    key: "kr-editor-role",
    name: "Editor",
    permissions: ["kanban.view", "kanban.create", "kanban.edit", "kanban.delete"],
    createdById: U_EDITOR,
  });
  await assignRole({
    userId: U_EDITOR,
    roleId: editorRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const viewerRole = await createRole({
    organizationId: ORG,
    key: "kr-viewer-role",
    name: "Viewer",
    permissions: ["kanban.view"],
    createdById: U_EDITOR,
  });
  await assignRole({
    userId: U_VIEWER,
    roleId: viewerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const gatedRole = await createRole({
    organizationId: ORG,
    key: "kr-gated-role",
    name: "Gated",
    permissions: ["kanban.view"],
    createdById: U_EDITOR,
  });
  await assignRole({
    userId: U_GATED,
    roleId: gatedRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  await assignRole({
    userId: U_ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });

  const open = await createBoard({ organizationId: ORG, name: "Open" });
  openBoardId = open.id;
  const cols = await listColumnsForBoard(open.id);
  col0 = cols[0]!.id;
  col1 = cols[1]!.id;

  const restricted = await createBoard({ organizationId: ORG, name: "Restricted" });
  restrictedBoardId = restricted.id;
  await setBoardRoleAccess(restricted.id, [gatedRole.id]); // visible only to the gated role

  on(WILDCARD_EVENT_TYPE, (e) => {
    captured.push(e);
  });
});

beforeEach(() => {
  captured.length = 0;
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
});

describe("kanban router — RBAC guards", () => {
  it("denies boards.list to a member without kanban.view", async () => {
    await expect(callerFor(U_OUTSIDER).boards.list({})).rejects.toThrow();
  });

  it("lets a viewer list boards but denies creating a card (needs kanban.edit)", async () => {
    await expect(callerFor(U_VIEWER).boards.list({})).resolves.toBeTruthy();
    await expect(
      callerFor(U_VIEWER).cards.create({ boardId: openBoardId, columnId: col0, title: "nope" }),
    ).rejects.toThrow();
  });

  it("lets an editor create a card", async () => {
    const card = await callerFor(U_EDITOR).cards.create({
      boardId: openBoardId,
      columnId: col0,
      title: "Editor card",
    });
    expect(card.title).toBe("Editor card");
  });
});

describe("kanban router — per-board role access", () => {
  it("hides a restricted board from a viewer lacking its role (NotFound)", async () => {
    await expect(callerFor(U_VIEWER).boards.get({ id: restrictedBoardId })).rejects.toThrow();
  });

  it("allows a user holding the board's role", async () => {
    const res = await callerFor(U_GATED).boards.get({ id: restrictedBoardId });
    expect(res.board.id).toBe(restrictedBoardId);
  });

  it("lets kanban.manage (admin) bypass the restriction", async () => {
    const res = await callerFor(U_ADMIN).boards.get({ id: restrictedBoardId });
    expect(res.board.id).toBe(restrictedBoardId);
  });

  it("still shows an open (unrestricted) board to a plain viewer", async () => {
    const res = await callerFor(U_VIEWER).boards.get({ id: openBoardId });
    expect(res.board.id).toBe(openBoardId);
  });
});

describe("kanban router — events + change detection", () => {
  it("emits card-created and one card-assigned per assignee on create", async () => {
    await callerFor(U_EDITOR).cards.create({
      boardId: openBoardId,
      columnId: col0,
      title: "C1",
      assigneeIds: [ASG_A, ASG_B],
    });
    expect(eventsOfType("kanban.card-created")).toHaveLength(1);
    expect(
      eventsOfType("kanban.card-assigned")
        .map((e) => e.assigneeId)
        .sort(),
    ).toEqual([ASG_A, ASG_B].sort());
  });

  it("flags changed fields and notifies ONLY newly-added assignees on update", async () => {
    const card = await callerFor(U_EDITOR).cards.create({
      boardId: openBoardId,
      columnId: col0,
      title: "C2",
      assigneeIds: [ASG_A, ASG_B],
    });
    captured.length = 0;

    await callerFor(U_EDITOR).cards.update({
      id: card.id,
      title: "C2 renamed",
      assigneeIds: [ASG_A, ASG_B, ASG_C], // A/B unchanged, C is new
    });

    const [updated] = eventsOfType("kanban.card-updated");
    expect(updated?.changed).toEqual(expect.arrayContaining(["title", "assignee"]));
    expect(updated?.changed).toHaveLength(2);
    // Existing assignees are NOT re-notified — only C.
    expect(eventsOfType("kanban.card-assigned").map((e) => e.assigneeId)).toEqual([ASG_C]);
  });

  it("emits card-moved when the status (column) changes", async () => {
    const card = await callerFor(U_EDITOR).cards.create({
      boardId: openBoardId,
      columnId: col0,
      title: "C3",
    });
    captured.length = 0;

    await callerFor(U_EDITOR).cards.update({ id: card.id, columnId: col1 });

    const [moved] = eventsOfType("kanban.card-moved");
    expect(moved?.fromColumnId).toBe(col0);
    expect(moved?.toColumnId).toBe(col1);
  });

  it("flags only the field that actually changed (no false assignee/move events)", async () => {
    const card = await callerFor(U_EDITOR).cards.create({
      boardId: openBoardId,
      columnId: col0,
      title: "C4",
      priority: "LOW",
    });
    captured.length = 0;

    await callerFor(U_EDITOR).cards.update({ id: card.id, priority: "HIGH" });

    expect(eventsOfType("kanban.card-updated")[0]?.changed).toEqual(["priority"]);
    expect(eventsOfType("kanban.card-assigned")).toHaveLength(0);
    expect(eventsOfType("kanban.card-moved")).toHaveLength(0);
  });
});
