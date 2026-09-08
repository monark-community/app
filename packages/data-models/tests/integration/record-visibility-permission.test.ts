import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

// Row visibility used to be implied by `data-models.manage-schema` : the
// router's `recordAccessContext` resolved its row-level `bypass` from it, so
// "can add a field to a model" also meant "can read every record in it,
// including rows restricted by DataRecordRoleAccess". Those are different
// powers, and an org may want a data steward who designs schemas but cannot
// read HR / payroll / legal rows.
//
// Visibility now has its own capability, `data-models.view-all-records`. These
// specs pin both halves: manage-schema alone no longer bypasses, and the new
// permission does. A regression in the first is a data leak ; a regression in
// the second locks admins out of their own records.

const ORG = "dm-vis-org";
const U_STEWARD = "dm-vis-steward"; // manage-schema + record-read, NO view-all-records
const U_VIEWER = "dm-vis-viewer"; // record-read + view-all-records
const U_PLAIN = "dm-vis-plain"; // record-read only
const U_ADMIN = "dm-vis-admin"; // built-in ADMIN, short-circuits everything
const ADMIN_BUILTIN_ID = "role_admin_builtin";

const createCaller = t.createCallerFactory(dataModelsRouter);
const callerFor = (userId: string) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "vis-test" });

let modelId = "";
let openRecordId = "";
let restrictedRecordId = "";

const ALL_USERS = [U_STEWARD, U_VIEWER, U_PLAIN, U_ADMIN];

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });

  registerDataModelsPermissions();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const model = await createDataModel({
    organizationId: ORG,
    key: "vis",
    name: "Vis",
    createdBy: U_ADMIN,
  });
  modelId = model.id;
  registerDataModelRegistrations({ key: model.key, name: model.name });
  await createDataField({
    dataModelId: modelId,
    key: "name",
    label: "Name",
    type: "TEXT",
    config: {},
  });

  const open = await createDataRecord({
    dataModelId: modelId,
    data: { title: "open", name: "open" },
    createdBy: U_ADMIN,
  });
  const restricted = await createDataRecord({
    dataModelId: modelId,
    data: { title: "restricted", name: "restricted" },
    createdBy: U_ADMIN,
  });
  openRecordId = open.id;
  restrictedRecordId = restricted.id;

  // A role that exists only to gate the restricted record. Nobody under test
  // holds it, so the record is reachable only by a visibility bypass.
  const gateRole = await createRole({
    organizationId: ORG,
    key: "vis-gate",
    name: "Vis Gate",
    permissions: [],
    createdById: U_ADMIN,
  });
  await setDataRecordRoleAccess(restrictedRecordId, [gateRole.id]);

  const stewardRole = await createRole({
    organizationId: ORG,
    key: "vis-steward",
    name: "Vis Steward",
    permissions: ["data-models.manage-schema", "data-models.record-read"],
    createdById: U_ADMIN,
  });
  await assignRole({
    userId: U_STEWARD,
    roleId: stewardRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const viewerRole = await createRole({
    organizationId: ORG,
    key: "vis-viewer",
    name: "Vis Viewer",
    permissions: ["data-models.record-read", "data-models.view-all-records"],
    createdById: U_ADMIN,
  });
  await assignRole({
    userId: U_VIEWER,
    roleId: viewerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const plainRole = await createRole({
    organizationId: ORG,
    key: "vis-plain",
    name: "Vis Plain",
    permissions: ["data-models.record-read"],
    createdById: U_ADMIN,
  });
  await assignRole({
    userId: U_PLAIN,
    roleId: plainRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  await assignRole({
    userId: U_ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
});

const titlesFor = async (userId: string) => {
  const page = await callerFor(userId).records.list({ dataModelId: modelId });
  return page.items.map((r) => r.title).sort();
};

describe("row visibility is its own capability, not a side effect of manage-schema", () => {
  it("manage-schema alone no longer reveals a restricted record", async () => {
    // The regression this guards: before the split, this caller saw both.
    expect(await titlesFor(U_STEWARD)).toEqual(["open"]);
  });

  it("view-all-records reveals it", async () => {
    expect(await titlesFor(U_VIEWER)).toEqual(["open", "restricted"]);
  });

  it("a plain record-read caller sees only the unrestricted record", async () => {
    expect(await titlesFor(U_PLAIN)).toEqual(["open"]);
  });

  it("built-in ADMIN still sees everything by short-circuit, with no stored grant", async () => {
    expect(await titlesFor(U_ADMIN)).toEqual(["open", "restricted"]);
    const stored = await getDb().rolePermission.findFirst({
      where: { roleId: ADMIN_BUILTIN_ID, module: "data-models", permission: "view-all-records" },
    });
    expect(stored).toBeNull();
  });

  it("hides a restricted record as not-found rather than forbidden, so existence does not leak", async () => {
    // A bare `createCallerFactory` has no error formatter, so the domain error
    // surfaces as an INTERNAL_SERVER_ERROR wrapping its cause rather than a
    // mapped NOT_FOUND (the same reason the sibling authorization suite only
    // asserts `.rejects.toThrow()`). Assert on the cause's SHAPE, not
    // `instanceof` : the monorepo can hold two copies of @monark/common, which
    // is why services/api/src/public/mount.ts classifies by shape too.
    const err = await callerFor(U_STEWARD)
      .records.getById({ id: restrictedRecordId })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).not.toBeNull();
    const cause = (err as { cause?: { code?: string; statusCode?: number } }).cause;
    expect(cause?.code).toBe("not_found");
    expect(cause?.statusCode).toBe(404);

    // ...while the unrestricted one resolves normally for the same caller, so
    // this is really about the row and not a blanket denial.
    const ok = await callerFor(U_STEWARD).records.getById({ id: openRecordId });
    expect(ok.title).toBe("open");
  });
});

describe("the backfill migration keeps the upgrade a no-op", () => {
  // Executes the REAL migration SQL, read from disk, so this test fails if the
  // statement is edited into something that stops backfilling. The migration
  // itself already ran (against an empty DB) during global setup ; here we seed
  // a manage-schema grant first and re-run it, which is exactly the shape of a
  // real deployment's upgrade.
  const migrationSql = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../db/prisma/migrations/20260908120000_split_record_visibility_permission/migration.sql",
    ),
    "utf-8",
  );

  it("grants view-all-records to every role that already held manage-schema", async () => {
    const db = getDb();
    const legacy = await createRole({
      organizationId: ORG,
      key: "vis-legacy",
      name: "Vis Legacy",
      permissions: ["data-models.manage-schema"],
      createdById: U_ADMIN,
    });

    const before = await db.rolePermission.findFirst({
      where: { roleId: legacy.id, module: "data-models", permission: "view-all-records" },
    });
    expect(before).toBeNull();

    await db.$executeRawUnsafe(migrationSql);

    const after = await db.rolePermission.findFirst({
      where: { roleId: legacy.id, module: "data-models", permission: "view-all-records" },
    });
    expect(after).not.toBeNull();
  });

  it("is idempotent, so a re-run cannot duplicate grants", async () => {
    const db = getDb();
    await db.$executeRawUnsafe(migrationSql);
    await db.$executeRawUnsafe(migrationSql);
    const rows = await db.rolePermission.findMany({
      where: { module: "data-models", permission: "view-all-records" },
    });
    const roleIds = rows.map((r) => r.roleId);
    expect(new Set(roleIds).size).toBe(roleIds.length);
  });

  it("does not grant it to a role that never held manage-schema", async () => {
    const db = getDb();
    await db.$executeRawUnsafe(migrationSql);
    const plain = await db.role.findFirst({ where: { organizationId: ORG, key: "vis-plain" } });
    const granted = await db.rolePermission.findFirst({
      where: { roleId: plain?.id, module: "data-models", permission: "view-all-records" },
    });
    expect(granted).toBeNull();
  });
});
