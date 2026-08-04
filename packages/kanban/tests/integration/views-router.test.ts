import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { leaf } from "@monark/query/contracts";
import { createBoard } from "../../src/server/data";
import { registerKanbanPermissions } from "../../src/server/permissions";
import { kanbanRouter } from "../../src/server/index";

// Saved kanban views through the REAL tRPC procedures : read gated by
// kanban.view + board access, edit scoped to the owner, personal-vs-shared
// visibility. Mirrors data-models' views-router test.

const ORG = "kb-views-org";
const OWNER = "kb-views-owner"; // kanban.view
const OTHER = "kb-views-other"; // kanban.view
const OUTSIDER = "kb-views-outsider"; // member, no role
const ALL = [OWNER, OTHER, OUTSIDER];

const createCaller = t.createCallerFactory(kanbanRouter);
const callerFor = (userId: string) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "kb-views-test" });

let boardId = "";
const QUERY = leaf("title", "contains", "x");

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL } } });
  registerKanbanPermissions();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const viewerRole = await createRole({
    organizationId: ORG,
    key: "kb-views-viewer",
    name: "Viewer",
    permissions: ["kanban.view"],
    createdById: OWNER,
  });
  for (const id of [OWNER, OTHER]) {
    await assignRole({ userId: id, roleId: viewerRole.id, organizationId: ORG, grantedById: null });
  }

  // A board with no role restriction is visible to every kanban.view holder.
  const board = await createBoard({ organizationId: ORG, name: "Board" });
  boardId = board.id;
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL } } });
});

describe("kanban views router", () => {
  let viewId = "";

  it("denies list to a member without kanban.view", async () => {
    await expect(callerFor(OUTSIDER).views.list({ boardId })).rejects.toThrow();
  });

  it("creates a personal view (mine, not shared)", async () => {
    const view = await callerFor(OWNER).views.create({ boardId, name: "My cards", query: QUERY });
    viewId = view.id;
    expect(view.mine).toBe(true);
    expect(view.shared).toBe(false);
    expect(view.query).toEqual(QUERY);
  });

  it("a personal view is invisible to another user", async () => {
    expect((await callerFor(OWNER).views.list({ boardId })).map((v) => v.id)).toContain(viewId);
    expect((await callerFor(OTHER).views.list({ boardId })).map((v) => v.id)).not.toContain(viewId);
  });

  it("sharing it makes it visible to others (as not-mine)", async () => {
    await callerFor(OWNER).views.update({ id: viewId, shared: true });
    const seen = (await callerFor(OTHER).views.list({ boardId })).find((v) => v.id === viewId);
    expect(seen?.mine).toBe(false);
    expect(seen?.shared).toBe(true);
  });

  it("a non-owner cannot update or delete a shared view", async () => {
    await expect(callerFor(OTHER).views.update({ id: viewId, name: "hijack" })).rejects.toThrow();
    await expect(callerFor(OTHER).views.delete({ id: viewId })).rejects.toThrow();
  });

  it("the owner can rename + delete their view", async () => {
    const renamed = await callerFor(OWNER).views.update({ id: viewId, name: "Renamed" });
    expect(renamed.name).toBe("Renamed");
    await callerFor(OWNER).views.delete({ id: viewId });
    expect((await callerFor(OWNER).views.list({ boardId })).map((v) => v.id)).not.toContain(viewId);
  });
});
