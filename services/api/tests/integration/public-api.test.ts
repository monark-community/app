/**
 * End-to-end integration tests for the public REST API (/api/v1).
 *
 * Drives the REAL Express app over HTTP (supertest) against a Postgres
 * testcontainer, with REAL API keys. This is the seam the unit tests can't
 * reach : the auth middleware, the flag gate, the tRPC server-side caller, and
 * the error→HTTP mapping all running together on a live request.
 *
 * Authority is 100% RBAC — there is no scope layer. Two principals prove it :
 *   - an ADMIN owner's user key (full rights), and
 *   - a read-only SERVICE ACCOUNT key (a machine principal granted only a
 *     read role) — the RBAC-native way to get a least-privilege key.
 *
 * What's covered :
 *   - `GET /openapi.json` (unauthenticated, flag-gated) returns a spec.
 *   - Auth : no key → 401, garbage key → 401, valid key → 200.
 *   - `GET /me` echoes the key's principal + org.
 *   - Reads with a read-only key : `/models`, `/models/:key/records`, `/records/:id`.
 *   - Write with the full key (200) vs. the read-only key (403 — RBAC denial).
 *   - Body validation → 400.
 *   - Revocation : a revoked key is 401.
 *   - The `public-api.enabled` kill switch : flag off → 404 even with a valid key.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { setOverride, syncFlagsToDatabase } from "@monark/feature-flags/server";

// Env the api's `env.ts` validates at module-load ; stamp before importing.
process.env.CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_test";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "sb_secret_test";
process.env.NODE_ENV = "test";

const { app } = await import("../../src/server");
const { appRouter } = await import("../../src/trpc/router");
const createCaller = t.createCallerFactory(appRouter);

const ORG = "papi-org";
const OWNER = "papi-owner";
const ADMIN_BUILTIN_ID = "role_admin_builtin"; // migration-seeded built-in ADMIN
const MODEL_KEY = "widgets";
const FLAG = "public-api.enabled";
const SA_FLAG = "public-api.service-accounts";

let ownerKey = ""; // acts as the ADMIN owner → full rights
let readOnlyKey = ""; // a service-account key with only a read role
let limitedKey = ""; // a personal key capped to record-read only (owner is admin)
let recordId = "";

async function cleanup() {
  const db = getDb();
  await db.apiKey.deleteMany({ where: { organizationId: ORG } });
  await db.user.deleteMany({ where: { kind: "SERVICE", createdBy: OWNER } });
  await db.role.deleteMany({ where: { organizationId: ORG } });
  await db.roleAssignment.deleteMany({ where: { userId: OWNER } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.dataModel.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: OWNER } });
}

beforeAll(async () => {
  const db = getDb();
  await cleanup();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.user.create({ data: { id: OWNER, email: `${OWNER}@test.local` } });
  await db.organizationMembership.create({ data: { userId: OWNER, organizationId: ORG } });
  // Ensure the built-in ADMIN role exists at its migration sentinel id. The
  // production seed is a migration, but a sibling integration suite that
  // truncates the Role table can wipe it out of a shared test DB ; upserting
  // here keeps this suite hermetic regardless of file / package run order.
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
  // ADMIN short-circuits every permission, so the owner (and thus a key acting
  // as the owner) passes the data-models RBAC checks the routes rely on.
  await assignRole({
    userId: OWNER,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
  // A flag override FKs to a FeatureFlag definition row ; the entrypoint guard
  // skips the boot-time sync in tests, so seed the definitions first, then turn
  // on the public API + the service-accounts surface for this run.
  await syncFlagsToDatabase();
  await setOverride(FLAG, {}, true, OWNER);
  await setOverride(SA_FLAG, {}, true, OWNER);

  // Seed a model + field + record through the real procedures.
  const caller = createCaller({ userId: OWNER, activeOrganizationId: ORG, requestId: "seed" });
  const model = await caller.dataModels.models.create({ key: MODEL_KEY, name: "Widgets" });
  await caller.dataModels.fields.create({
    dataModelId: model.id,
    key: "name",
    label: "Name",
    type: "TEXT",
  });
  const record = await caller.dataModels.records.create({
    dataModelId: model.id,
    data: { title: "Alpha", name: "Alpha widget" },
  });
  recordId = record.id;

  // The owner's own key : acts as the ADMIN, full rights.
  ownerKey = (await caller.apiKeys.create({ name: "owner-key" })).plaintext;

  // A LIMITED personal key : the owner is an admin (can do everything), but the
  // key is capped to record-read only. Proves the per-key ceiling caps even an
  // admin owner — the RBAC-native "abstract sub-role".
  limitedKey = (
    await caller.apiKeys.create({
      name: "read-only-personal",
      fullAccess: false,
      permissions: ["data-models.record-read"],
    })
  ).plaintext;

  // A least-privilege key, done the RBAC-native way : a read-only role granted
  // to a purpose-built service account. The key inherits ONLY that role.
  const readRole = await createRole({
    organizationId: ORG,
    key: "papi-reader",
    name: "Reader",
    permissions: ["data-models.read-schema", "data-models.record-read"],
    createdById: OWNER,
  });
  const account = await caller.apiKeys.serviceAccounts.create({
    name: "readonly-bot",
    roleIds: [readRole.id],
  });
  readOnlyKey = (
    await caller.apiKeys.serviceAccounts.keys.create({
      serviceAccountId: account.id,
      name: "primary",
    })
  ).plaintext;
});

afterAll(async () => {
  await cleanup();
});

const authed = (key: string) => `Bearer ${key}`;

describe("public-api GET /api/v1/openapi.json", () => {
  it("serves an OpenAPI 3 spec (unauthenticated) with the v1 paths", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.paths["/models"]).toBeDefined();
    expect(res.body.paths["/models/{key}/records"]).toBeDefined();
    expect(res.body.components.securitySchemes.ApiKeyAuth.scheme).toBe("bearer");
    // Each route advertises its required RBAC permission (not a scope).
    expect(res.body.paths["/models/{key}/records"].post["x-required-permission"]).toBe(
      "data-models.record-write",
    );
  });
});

describe("public-api authentication", () => {
  it("401s a request with no API key", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("401s a request with an invalid API key", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", authed("mrk_bogus"));
    expect(res.status).toBe(401);
  });

  it("returns the key's principal + org for GET /me", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", authed(ownerKey));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: OWNER, organizationId: ORG });
    // Standard rate-limit headers ride on every /api/v1 response.
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });

  it("GET /me for a service-account key reports the machine principal", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", authed(readOnlyKey));
    expect(res.status).toBe(200);
    expect(res.body.userId.startsWith("svc_")).toBe(true);
    expect(res.body.organizationId).toBe(ORG);
  });
});

describe("public-api reads (read-only key)", () => {
  it("lists the org's Data Models", async () => {
    const res = await request(app).get("/api/v1/models").set("Authorization", authed(readOnlyKey));
    expect(res.status).toBe(200);
    const keys = (res.body.items as Array<{ key: string }>).map((m) => m.key);
    expect(keys).toContain(MODEL_KEY);
  });

  it("lists a model's records by key", async () => {
    const res = await request(app)
      .get(`/api/v1/models/${MODEL_KEY}/records`)
      .set("Authorization", authed(readOnlyKey));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("fetches a single record by id", async () => {
    const res = await request(app)
      .get(`/api/v1/records/${recordId}`)
      .set("Authorization", authed(readOnlyKey));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(recordId);
  });

  it("404s an unknown record id", async () => {
    const res = await request(app)
      .get("/api/v1/records/does-not-exist")
      .set("Authorization", authed(readOnlyKey));
    expect(res.status).toBe(404);
  });
});

describe("public-api writes + RBAC enforcement", () => {
  it("creates a record with the full-rights owner key", async () => {
    const res = await request(app)
      .post(`/api/v1/models/${MODEL_KEY}/records`)
      .set("Authorization", authed(ownerKey))
      .send({ data: { title: "Bravo", name: "Bravo widget" } });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  });

  it("403s a write with the read-only service-account key (RBAC denies record-write)", async () => {
    const res = await request(app)
      .post(`/api/v1/models/${MODEL_KEY}/records`)
      .set("Authorization", authed(readOnlyKey))
      .send({ data: { title: "Charlie", name: "Charlie widget" } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("400s an invalid body", async () => {
    const res = await request(app)
      .post(`/api/v1/models/${MODEL_KEY}/records`)
      .set("Authorization", authed(ownerKey))
      .send({ data: "not-an-object" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });
});

describe("public-api per-key permission ceiling", () => {
  it("a limited personal key reads records but is 403 on write — even though its owner is an admin", async () => {
    // record-read is in the key's allowlist → the record read succeeds (and the
    // internal model-key→id resolution, a schema read, is checked against the
    // admin owner, not the ceiling — so a record-read key isn't broken by it).
    const read = await request(app)
      .get(`/api/v1/models/${MODEL_KEY}/records`)
      .set("Authorization", authed(limitedKey));
    expect(read.status).toBe(200);

    // record-write is NOT in the allowlist → 403, capping the admin owner.
    const write = await request(app)
      .post(`/api/v1/models/${MODEL_KEY}/records`)
      .set("Authorization", authed(limitedKey))
      .send({ data: { title: "Delta", name: "Delta widget" } });
    expect(write.status).toBe(403);
    expect(write.body.error.code).toBe("forbidden");
  });

  it("still serves /me for a limited key (no permission required)", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", authed(limitedKey));
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(OWNER);
  });
});

describe("public-api revocation", () => {
  it("401s a key after it's revoked", async () => {
    const caller = createCaller({
      userId: OWNER,
      activeOrganizationId: ORG,
      requestId: "revoke",
    });
    const throwaway = await caller.apiKeys.create({ name: "throwaway" });
    // Works before revocation.
    const before = await request(app)
      .get("/api/v1/me")
      .set("Authorization", authed(throwaway.plaintext));
    expect(before.status).toBe(200);

    await caller.apiKeys.revoke({ id: throwaway.id });

    const after = await request(app)
      .get("/api/v1/me")
      .set("Authorization", authed(throwaway.plaintext));
    expect(after.status).toBe(401);
  });
});

describe("public-api kill switch", () => {
  it("404s every route when public-api.enabled is off, even with a valid key", async () => {
    await setOverride(FLAG, {}, false, OWNER);
    try {
      const me = await request(app).get("/api/v1/me").set("Authorization", authed(ownerKey));
      expect(me.status).toBe(404);
      const openapi = await request(app).get("/api/v1/openapi.json");
      expect(openapi.status).toBe(404);
    } finally {
      // Restore for any subsequent specs / re-runs against the same container.
      await setOverride(FLAG, {}, true, OWNER);
    }
  });
});
