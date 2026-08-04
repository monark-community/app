import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { on, registerEventTypes } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import type { DomainEvent } from "@monark/common/contracts/events";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { truncate } from "@monark/test-utils/db";
import { createEndpoint, enqueueDeliveries } from "../../src/server/data";
import { registerWebhooksPermissions } from "../../src/server/permissions";
import { webhooksRouter } from "../../src/server/index";

// Drives the REAL webhooks tRPC procedures via the caller factory against a
// real Postgres. Covers the RBAC guards (read / write / retry), the create →
// secret-in-response contract, the update `changed[]` diff, secret rotation,
// delete idempotency, delivery inspection, and the domain events each mutation
// emits. `assertOutboundUrlSafe` is a pure scheme/host check (no DNS), so a
// literal-host URL is enough to exercise both the safe and unsafe branches.
// No network: retryDelivery is only driven down its deny / not-found paths so
// the worker's outbound `deliverOne` never fires.

const ORG = "wh-router-org";
const U_MANAGER = "wh-manager"; // read + write + retry
const U_VIEWER = "wh-viewer"; // read only
const U_OUTSIDER = "wh-outsider"; // member, no role
const ALL_USERS = [U_MANAGER, U_VIEWER, U_OUTSIDER];

const SAFE_URL = "https://hooks.example.com/receive";

const createCaller = t.createCallerFactory(webhooksRouter);
const callerFor = (userId: string | undefined) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "wh-test" });

const captured: DomainEvent[] = [];
const eventsOfType = (type: string) => captured.filter((e) => e.type === type);

async function seedEndpoint(name = "seed"): Promise<string> {
  const ep = await createEndpoint({
    organizationId: ORG,
    name,
    url: SAFE_URL,
    description: null,
    secretHash: "seed-hash",
    subscriptions: [{ eventType: "demo.thing", isPrefix: false }],
  });
  return ep.id;
}

beforeAll(async () => {
  const db = getDb();
  await truncate(db, [
    "WebhookDeliveryAttempt",
    "WebhookDelivery",
    "WebhookSubscription",
    "WebhookEndpoint",
  ]);
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });

  registerWebhooksPermissions();
  // Give `listEventTypes` something to return.
  registerEventTypes("demo", {
    "demo.thing": { description: "A demo event", fields: [] },
  });

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const managerRole = await createRole({
    organizationId: ORG,
    key: "wh-manager-role",
    name: "WH Manager",
    permissions: ["webhooks.read", "webhooks.write", "webhooks.retry"],
    createdById: U_MANAGER,
  });
  await assignRole({
    userId: U_MANAGER,
    roleId: managerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const viewerRole = await createRole({
    organizationId: ORG,
    key: "wh-viewer-role",
    name: "WH Viewer",
    permissions: ["webhooks.read"],
    createdById: U_VIEWER,
  });
  await assignRole({
    userId: U_VIEWER,
    roleId: viewerRole.id,
    organizationId: ORG,
    grantedById: null,
  });
});

beforeEach(() => {
  _resetHandlersForTesting();
  captured.length = 0;
  on("*", (e) => void captured.push(e));
});

afterEach(async () => {
  await truncate(getDb(), [
    "WebhookDeliveryAttempt",
    "WebhookDelivery",
    "WebhookSubscription",
    "WebhookEndpoint",
  ]);
});

afterAll(async () => {
  const db = getDb();
  // FK-safe teardown : assignments → role permissions → custom roles → the
  // rest (RoleAssignment_roleId_fkey is ON DELETE RESTRICT).
  await db.roleAssignment.deleteMany({ where: { userId: { in: ALL_USERS } } });
  await db.rolePermission.deleteMany({ where: { role: { organizationId: ORG, builtIn: false } } });
  await db.role.deleteMany({ where: { organizationId: ORG, builtIn: false } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
});

describe("webhooks.listEventTypes", () => {
  it("returns grouped event types to an authed caller", async () => {
    const res = await callerFor(U_MANAGER).listEventTypes();
    const demo = res.groups.find((g) => g.module === "demo");
    expect(demo?.events.some((e) => e.type === "demo.thing")).toBe(true);
  });

  it("returns empty groups to an unauthed caller", async () => {
    const res = await callerFor(undefined).listEventTypes();
    expect(res.groups).toEqual([]);
  });
});

describe("webhooks.create", () => {
  it("mints a secret, returns it once, and emits endpoint-created", async () => {
    const res = await callerFor(U_MANAGER).create({
      organizationId: ORG,
      name: "My hook",
      url: SAFE_URL,
      subscriptions: [{ eventType: "demo.thing" }],
    });
    expect(res.secret).toMatch(/.+/);
    expect(res.endpoint.url).toBe(SAFE_URL);
    // The persisted row stores only the hash, never the plaintext.
    const row = await getDb().webhookEndpoint.findUniqueOrThrow({ where: { id: res.endpoint.id } });
    expect(row.secretHash).not.toBe(res.secret);
    expect(eventsOfType("webhook.endpoint-created")).toHaveLength(1);
  });

  it("denies a caller without webhooks.write", async () => {
    await expect(
      callerFor(U_VIEWER).create({
        organizationId: ORG,
        name: "nope",
        url: SAFE_URL,
        subscriptions: [],
      }),
    ).rejects.toThrow();
  });

  it("rejects an unsafe target URL", async () => {
    await expect(
      callerFor(U_MANAGER).create({
        organizationId: ORG,
        name: "bad",
        // https:// to a private IP → SSRF-blocked (http://localhost is allowed
        // in dev, so use a rule that fires regardless of environment).
        url: "https://10.0.0.1/hook",
        subscriptions: [],
      }),
    ).rejects.toThrow();
  });
});

describe("webhooks.list / get", () => {
  it("lists the org's endpoints for a reader", async () => {
    await seedEndpoint("one");
    await seedEndpoint("two");
    const rows = await callerFor(U_MANAGER).list({ organizationId: ORG });
    expect(rows.length).toBe(2);
  });

  it("denies list to an outsider without webhooks.read", async () => {
    await expect(callerFor(U_OUTSIDER).list({ organizationId: ORG })).rejects.toThrow();
  });

  it("gets an endpoint by id and 404s on a missing one", async () => {
    const id = await seedEndpoint();
    const got = await callerFor(U_VIEWER).get({ id });
    expect(got.id).toBe(id);
    await expect(callerFor(U_MANAGER).get({ id: "missing" })).rejects.toThrow(/not found/i);
  });
});

describe("webhooks.update", () => {
  it("applies a patch and emits endpoint-updated with the changed set", async () => {
    const id = await seedEndpoint("before");
    const updated = await callerFor(U_MANAGER).update({ id, name: "after", status: "disabled" });
    expect(updated.name).toBe("after");
    expect(updated.status).toBe("disabled");
    const evt = eventsOfType("webhook.endpoint-updated")[0] as { changed?: string[] } | undefined;
    expect(evt?.changed).toEqual(expect.arrayContaining(["name", "status"]));
  });

  it("404s on a missing endpoint", async () => {
    await expect(callerFor(U_MANAGER).update({ id: "missing", name: "x" })).rejects.toThrow(
      /not found/i,
    );
  });

  it("denies a reader without write", async () => {
    const id = await seedEndpoint();
    await expect(callerFor(U_VIEWER).update({ id, name: "x" })).rejects.toThrow();
  });
});

describe("webhooks.rotateSecret", () => {
  it("issues a fresh secret and emits secret-rotated", async () => {
    const id = await seedEndpoint();
    const beforeHash = (await getDb().webhookEndpoint.findUniqueOrThrow({ where: { id } }))
      .secretHash;
    const { secret } = await callerFor(U_MANAGER).rotateSecret({ id });
    expect(secret).toMatch(/.+/);
    const afterHash = (await getDb().webhookEndpoint.findUniqueOrThrow({ where: { id } }))
      .secretHash;
    expect(afterHash).not.toBe(beforeHash);
    expect(eventsOfType("webhook.endpoint-secret-rotated")).toHaveLength(1);
  });

  it("404s on a missing endpoint", async () => {
    await expect(callerFor(U_MANAGER).rotateSecret({ id: "missing" })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("webhooks.delete", () => {
  it("deletes an endpoint and emits endpoint-deleted", async () => {
    const id = await seedEndpoint();
    await callerFor(U_MANAGER).delete({ id });
    expect(await getDb().webhookEndpoint.findUnique({ where: { id } })).toBeNull();
    expect(eventsOfType("webhook.endpoint-deleted")).toHaveLength(1);
  });

  it("is a silent no-op when the endpoint is already gone", async () => {
    await expect(callerFor(U_MANAGER).delete({ id: "missing" })).resolves.toBeUndefined();
    expect(eventsOfType("webhook.endpoint-deleted")).toHaveLength(0);
  });

  it("denies a reader without write", async () => {
    const id = await seedEndpoint();
    await expect(callerFor(U_VIEWER).delete({ id })).rejects.toThrow();
  });
});

describe("webhooks delivery inspection", () => {
  async function seedDelivery(): Promise<{ endpointId: string; deliveryId: string }> {
    const endpointId = await seedEndpoint();
    const [delivery] = await enqueueDeliveries({
      matches: [{ endpointId, idempotencyKey: "idem-1" }],
      eventType: "demo.thing",
      payload: { hello: "world" },
    });
    if (!delivery) throw new Error("failed to seed delivery");
    return { endpointId, deliveryId: delivery.id };
  }

  it("lists deliveries for an endpoint and 404s on a missing endpoint", async () => {
    const { endpointId } = await seedDelivery();
    const page = await callerFor(U_MANAGER).listDeliveries({ endpointId });
    expect(page.length).toBe(1);
    await expect(callerFor(U_MANAGER).listDeliveries({ endpointId: "missing" })).rejects.toThrow(
      /not found/i,
    );
  });

  it("gets a delivery with its (empty) attempt list and flattens the payload", async () => {
    const { deliveryId } = await seedDelivery();
    const res = await callerFor(U_MANAGER).getDelivery({ id: deliveryId });
    expect(res.delivery.id).toBe(deliveryId);
    expect(res.delivery.payload).toEqual({ hello: "world" });
    expect(res.attempts).toEqual([]);
    await expect(callerFor(U_MANAGER).getDelivery({ id: "missing" })).rejects.toThrow(/not found/i);
  });

  it("guards retryDelivery : 404 on missing, denied without webhooks.retry", async () => {
    const { deliveryId } = await seedDelivery();
    await expect(callerFor(U_MANAGER).retryDelivery({ id: "missing" })).rejects.toThrow(
      /not found/i,
    );
    await expect(callerFor(U_VIEWER).retryDelivery({ id: deliveryId })).rejects.toThrow();
  });
});
