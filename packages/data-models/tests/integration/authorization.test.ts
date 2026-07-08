import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import {
  createDataField,
  createDataModel,
  createDataRecord,
  setDataRecordRoleAccess,
} from "../../src/server/data";
import { registerDataModelsPermissions } from "../../src/server/permissions";
import { registerDataModelRegistrations } from "../../src/server/registrations";
import { dataModelsRouter } from "../../src/server/router";

// Authorization boundary for record access, driven through the REAL tRPC
// procedures as NON-admin callers. `requireModelAccess` grants a record
// operation when the caller has EITHER the per-model permission
// (`data-models.<key>-record-<verb>`) OR the generic `data-models.record-<verb>`
// ; ADMIN/SYSADMIN short-circuit both. The rest of the suite (and the manual
// verification) exercised this only as an admin, who bypasses the whole check —
// so these specs prove the DENY path: a user scoped to one model can read it
// but is denied another model, denied cross-org, and cannot write with only
// read. A regression here is a privilege escalation or a cross-org data leak.

const ORG_A = "dm-authz-org-a";
const ORG_B = "dm-authz-org-b";
const U_SCOPED = "dm-authz-scoped"; // custom role: data-models.alpha-record-read only
const U_GENERIC = "dm-authz-generic"; // custom role: data-models.record-read (all models)
const U_OUTSIDER = "dm-authz-outsider"; // org member, no role
const U_SECRET = "dm-authz-secret"; // alpha model access + the "secret" gating role
const U_ADMIN = "dm-authz-admin"; // built-in ADMIN (bypasses row-level)
const ADMIN_BUILTIN_ID = "role_admin_builtin"; // migration-seeded built-in ADMIN row

const createCaller = t.createCallerFactory(dataModelsRouter);
const callerFor = (userId: string, orgId: string | null) =>
  createCaller({ userId, activeOrganizationId: orgId, requestId: "authz-test" });

let alphaId = "";
let betaId = "";
let gammaId = "";
let restrictedId = ""; // a record in alpha restricted to the "secret" role

beforeAll(async () => {
  const db = getDb();
  // Clean slate — a crashed prior run could leave the org-scoped roles/models
  // behind and collide on the per-org role key.
  const ALL_USERS = [U_SCOPED, U_GENERIC, U_OUTSIDER, U_SECRET, U_ADMIN];
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });

  registerDataModelsPermissions(); // generic data-models.* keys (for createRole validation)

  for (const id of [ORG_A, ORG_B]) {
    await db.organization.create({ data: { id, slug: id, displayName: id } });
  }
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    // Members of ORG_A — `requireOrg` resolves the active org via membership,
    // so without this a denied call would reject as "org not found" rather
    // than exercising the permission check we care about.
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG_A } });
  }

  const alpha = await createDataModel({
    organizationId: ORG_A,
    key: "alpha",
    name: "Alpha",
    createdBy: U_SCOPED,
  });
  const beta = await createDataModel({
    organizationId: ORG_A,
    key: "beta",
    name: "Beta",
    createdBy: U_SCOPED,
  });
  const gamma = await createDataModel({
    organizationId: ORG_B,
    key: "gamma",
    name: "Gamma",
    createdBy: U_SCOPED,
  });
  alphaId = alpha.id;
  betaId = beta.id;
  gammaId = gamma.id;

  for (const m of [alpha, beta, gamma]) {
    await createDataField({
      dataModelId: m.id,
      key: "name",
      label: "Name",
      type: "TEXT",
      config: {},
    });
    await createDataRecord({ dataModelId: m.id, data: { name: "seed" }, createdBy: U_SCOPED });
    // Register per-model perms so `createRole`'s registry validation accepts
    // `data-models.<key>-record-*`.
    registerDataModelRegistrations({ key: m.key, name: m.name });
  }

  const scopedRole = await createRole({
    organizationId: ORG_A,
    key: "authz-scoped",
    name: "Authz Scoped",
    permissions: ["data-models.alpha-record-read"],
    createdById: U_SCOPED,
  });
  await assignRole({
    userId: U_SCOPED,
    roleId: scopedRole.id,
    organizationId: ORG_A,
    grantedById: null,
  });

  const genericRole = await createRole({
    organizationId: ORG_A,
    key: "authz-generic",
    name: "Authz Generic",
    permissions: ["data-models.record-read"],
    createdById: U_GENERIC,
  });
  await assignRole({
    userId: U_GENERIC,
    roleId: genericRole.id,
    organizationId: ORG_A,
    grantedById: null,
  });

  // ── Row-level (per-record) seeding ──
  // A role used purely to gate record visibility (no permissions of its own).
  const secretRole = await createRole({
    organizationId: ORG_A,
    key: "authz-secret",
    name: "Authz Secret",
    permissions: [],
    createdById: U_ADMIN,
  });
  // U_SECRET gets alpha model access (via the scoped role) AND the secret role.
  await assignRole({
    userId: U_SECRET,
    roleId: scopedRole.id,
    organizationId: ORG_A,
    grantedById: null,
  });
  await assignRole({
    userId: U_SECRET,
    roleId: secretRole.id,
    organizationId: ORG_A,
    grantedById: null,
  });
  // U_ADMIN gets the built-in ADMIN role — short-circuits every permission,
  // including the manage-schema row-level bypass.
  await assignRole({
    userId: U_ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG_A,
    grantedById: null,
  });

  // A record in alpha restricted to the secret role only.
  const restricted = await createDataRecord({
    dataModelId: alphaId,
    data: { name: "restricted" },
    createdBy: U_ADMIN,
  });
  restrictedId = restricted.id;
  await setDataRecordRoleAccess(restrictedId, [secretRole.id]);
});

afterAll(async () => {
  const db = getDb();
  // Deleting the orgs cascades roles, assignments, memberships, models, records.
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  await db.user.deleteMany({
    where: { id: { in: [U_SCOPED, U_GENERIC, U_OUTSIDER, U_SECRET, U_ADMIN] } },
  });
});

describe("data-models authorization — per-model record access boundary", () => {
  it("ALLOWS the scoped user to read the model they're granted", async () => {
    const page = await callerFor(U_SCOPED, ORG_A).records.list({ dataModelId: alphaId });
    expect(page.items.length).toBe(1);
  });

  it("DENIES the scoped user a different model in the same org", async () => {
    await expect(
      callerFor(U_SCOPED, ORG_A).records.list({ dataModelId: betaId }),
    ).rejects.toThrow();
  });

  it("DENIES cross-org access (a model in another org)", async () => {
    await expect(
      callerFor(U_SCOPED, ORG_A).records.list({ dataModelId: gammaId }),
    ).rejects.toThrow();
  });

  it("DENIES write when the user holds only read on that model", async () => {
    await expect(
      callerFor(U_SCOPED, ORG_A).records.create({ dataModelId: alphaId, data: { name: "x" } }),
    ).rejects.toThrow();
  });

  it("DENIES a member with no role", async () => {
    await expect(
      callerFor(U_OUTSIDER, ORG_A).records.list({ dataModelId: alphaId }),
    ).rejects.toThrow();
  });

  it("ALLOWS the generic-permission user to read every model in the org", async () => {
    const caller = callerFor(U_GENERIC, ORG_A);
    await expect(caller.records.list({ dataModelId: alphaId })).resolves.toBeTruthy();
    await expect(caller.records.list({ dataModelId: betaId })).resolves.toBeTruthy();
  });
});

describe("data-models authorization — per-record (row-level) access", () => {
  const ids = (page: { items: Array<{ id: string }> }) => page.items.map((r) => r.id);

  it("hides a restricted record from a model-accessor lacking the gating role", async () => {
    const page = await callerFor(U_SCOPED, ORG_A).records.list({ dataModelId: alphaId });
    expect(ids(page)).not.toContain(restrictedId);
    // still sees the one unrestricted record
    expect(page.items.length).toBe(1);
  });

  it("404s getById of a restricted record for a caller without the gating role", async () => {
    await expect(
      callerFor(U_SCOPED, ORG_A).records.getById({ id: restrictedId }),
    ).rejects.toThrow();
  });

  it("shows the restricted record to a caller holding the gating role", async () => {
    const page = await callerFor(U_SECRET, ORG_A).records.list({ dataModelId: alphaId });
    expect(ids(page)).toContain(restrictedId);
    await expect(
      callerFor(U_SECRET, ORG_A).records.getById({ id: restrictedId }),
    ).resolves.toBeTruthy();
  });

  it("does NOT let a generic record-read grant bypass row-level restrictions", async () => {
    // Blanket "read all records" is still subject to per-record privacy — only
    // data admins (manage-schema) bypass. So the restricted record stays hidden.
    const page = await callerFor(U_GENERIC, ORG_A).records.list({ dataModelId: alphaId });
    expect(ids(page)).not.toContain(restrictedId);
  });

  it("lets a data admin (ADMIN → manage-schema) bypass row-level restrictions", async () => {
    const page = await callerFor(U_ADMIN, ORG_A).records.list({ dataModelId: alphaId });
    expect(ids(page)).toContain(restrictedId);
    await expect(
      callerFor(U_ADMIN, ORG_A).records.getById({ id: restrictedId }),
    ).resolves.toBeTruthy();
  });

  // Mutating spec — runs last : opening the record up must not affect the specs
  // above (vitest runs a file's specs sequentially in definition order).
  it("round-trips access via setAccess/getAccess, then reflects in visibility", async () => {
    await callerFor(U_ADMIN, ORG_A).records.setAccess({ id: restrictedId, roleIds: [] });
    const acc = await callerFor(U_ADMIN, ORG_A).records.getAccess({ id: restrictedId });
    expect(acc.roleIds).toEqual([]);
    // Now the previously-denied scoped user can see it (empty list = open).
    const page = await callerFor(U_SCOPED, ORG_A).records.list({ dataModelId: alphaId });
    expect(ids(page)).toContain(restrictedId);
  });
});
