import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createEndpoint,
  deleteEndpoint,
  disableEndpointForFailures,
  enqueueDeliveries,
  findEndpointById,
  listEndpointsForOrg,
  listPendingDueDeliveries,
  markDeliveryFailed,
  markDeliveryRetry,
  markDeliverySucceeded,
  recordAttempt,
  rotateEndpointSecret,
  updateEndpointPatch,
} from "../../src/server/data";

// Integration tests for the webhooks data layer. Each case starts
// from a known clean slate — `truncate` clears the endpoint +
// delivery + attempt tables in `afterEach`. The Postgres
// testcontainer is shared across the whole spec process (booted in
// `@monark/test-utils/global-setup`).
//
// What's covered :
//   - createEndpoint / findEndpointById / listEndpointsForOrg /
//     updateEndpointPatch / deleteEndpoint round-trip
//   - rotateEndpointSecret swaps the hash cleanly
//   - enqueueDeliveries idempotency (P2002 swallow on duplicate
//     idempotency key — the load-bearing guarantee for "retry the
//     source mutation, don't double-deliver")
//   - listPendingDueDeliveries respects the nextAttemptAt cutoff
//   - markDelivery{Succeeded,Retry,Failed} persists state +
//     consecutiveFailures counter the worker depends on
//   - disableEndpointForFailures flips status atomically with reason
//
// What's NOT covered here (lives in the unit suite) :
//   - HMAC-SHA-256 signature math
//   - Subscription matching / prefix routing
//   - Worker tick loop / retry backoff curve

const ORG_ID = "test-org-webhooks";

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      slug: "test-org-webhooks",
      displayName: "Test Org Webhooks",
    },
    update: {},
  });
});

afterEach(async () => {
  // CASCADE cleans subscriptions / deliveries / attempts when their
  // parent endpoint goes ; truncate the parent.
  await truncate(getDb(), ["WebhookEndpoint"]);
});

// `beforeAll` seeded the org ; clean it on suite exit. Defensive ; the
// testcontainer is destroyed anyway, but the `assert-test-db` setupFile
// aborts before this runs if someone bypassed globalSetup, so we never
// reach a real DB.
afterAll(async () => {
  await getDb().organization.deleteMany({ where: { id: ORG_ID } });
});

describe("webhooks/data createEndpoint + findEndpointById", () => {
  it("persists an endpoint with its subscriptions and round-trips it", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Receiver",
      url: "https://example.test/hook",
      description: "the test receiver",
      secretHash: "hash-1",
      subscriptions: [
        { eventType: "rbac.role-assigned", isPrefix: false },
        { eventType: "auth.", isPrefix: true },
      ],
    });
    expect(ep.organizationId).toBe(ORG_ID);
    expect(ep.subscriptions).toHaveLength(2);

    const found = await findEndpointById(ep.id);
    expect(found?.url).toBe("https://example.test/hook");
    expect(found?.name).toBe("Receiver");
    expect(found?.subscriptions.map((s) => s.eventType).sort()).toEqual([
      "auth.",
      "rbac.role-assigned",
    ]);
  });

  it("listEndpointsForOrg returns only the org's rows", async () => {
    await createEndpoint({
      organizationId: ORG_ID,
      name: "A",
      url: "https://a.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    await createEndpoint({
      organizationId: null, // platform-tier
      name: "Platform",
      url: "https://platform.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    const orgRows = await listEndpointsForOrg(ORG_ID);
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0]?.name).toBe("A");
    const platformRows = await listEndpointsForOrg(null);
    expect(platformRows).toHaveLength(1);
    expect(platformRows[0]?.name).toBe("Platform");
  });
});

describe("webhooks/data updateEndpointPatch", () => {
  it("only mutates the fields present in the patch", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Before",
      url: "https://before.test",
      description: "before",
      secretHash: "h",
      subscriptions: [],
    });
    const updated = await updateEndpointPatch({
      id: ep.id,
      name: "After",
      // url + description left undefined ; should not change
    });
    expect(updated.name).toBe("After");
    expect(updated.url).toBe("https://before.test");
    expect(updated.description).toBe("before");
  });

  it("flipping status to disabled stamps disabledAt and clears it on re-enable", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Toggleable",
      url: "https://t.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    const disabled = await updateEndpointPatch({
      id: ep.id,
      status: "disabled",
      disabledReason: "manual",
    });
    expect(disabled.status).toBe("disabled");
    expect(disabled.disabledAt).not.toBeNull();
    expect(disabled.disabledReason).toBe("manual");

    const reenabled = await updateEndpointPatch({
      id: ep.id,
      status: "active",
    });
    expect(reenabled.status).toBe("active");
    expect(reenabled.disabledAt).toBeNull();
    expect(reenabled.disabledReason).toBeNull();
    // Re-enable resets the failure counter so the disable countdown
    // restarts cleanly after the operator's intervention.
    expect(reenabled.consecutiveFailures).toBe(0);
  });

  it("replacing subscriptions deletes the prior set in one shot", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Subbed",
      url: "https://s.test",
      description: null,
      secretHash: "h",
      subscriptions: [{ eventType: "auth.signed-in", isPrefix: false }],
    });
    const updated = await updateEndpointPatch({
      id: ep.id,
      subscriptions: [{ eventType: "rbac.", isPrefix: true }],
    });
    expect(updated.subscriptions).toHaveLength(1);
    expect(updated.subscriptions[0]?.eventType).toBe("rbac.");
    expect(updated.subscriptions[0]?.isPrefix).toBe(true);
  });
});

describe("webhooks/data rotateEndpointSecret + deleteEndpoint", () => {
  it("rotateEndpointSecret swaps the hash without touching anything else", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Rotator",
      url: "https://r.test",
      description: "before",
      secretHash: "old-hash",
      subscriptions: [{ eventType: "auth.", isPrefix: true }],
    });
    const rotated = await rotateEndpointSecret({
      id: ep.id,
      secretHash: "new-hash",
    });
    expect(rotated.secretHash).toBe("new-hash");
    expect(rotated.url).toBe("https://r.test");
    expect(rotated.subscriptions).toHaveLength(1);
  });

  it("deleteEndpoint cascades to subscriptions / deliveries / attempts", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Doomed",
      url: "https://d.test",
      description: null,
      secretHash: "h",
      subscriptions: [{ eventType: "auth.signed-in", isPrefix: false }],
    });
    const [delivery] = await enqueueDeliveries({
      matches: [{ endpointId: ep.id, idempotencyKey: "k1" }],
      eventType: "auth.signed-in",
      payload: { foo: "bar" },
    });
    expect(delivery).toBeDefined();
    await recordAttempt({
      deliveryId: delivery!.id,
      attemptNumber: 1,
      startedAt: new Date(Date.now() - 100),
      finishedAt: new Date(),
      statusCode: 500,
      error: "kaboom",
    });

    await deleteEndpoint(ep.id);

    const db = getDb();
    expect(await findEndpointById(ep.id)).toBeNull();
    expect(await db.webhookSubscription.count({ where: { endpointId: ep.id } })).toBe(0);
    expect(await db.webhookDelivery.count({ where: { endpointId: ep.id } })).toBe(0);
    expect(
      await db.webhookDeliveryAttempt.count({
        where: { delivery: { endpointId: ep.id } },
      }),
    ).toBe(0);
  });
});

describe("webhooks/data enqueueDeliveries", () => {
  it("creates one delivery row per match", async () => {
    const a = await createEndpoint({
      organizationId: ORG_ID,
      name: "A",
      url: "https://a.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    const b = await createEndpoint({
      organizationId: ORG_ID,
      name: "B",
      url: "https://b.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    const created = await enqueueDeliveries({
      matches: [
        { endpointId: a.id, idempotencyKey: "evt-1:a" },
        { endpointId: b.id, idempotencyKey: "evt-1:b" },
      ],
      eventType: "auth.signed-in",
      payload: { userId: "u1" },
    });
    expect(created).toHaveLength(2);
    expect(new Set(created.map((d) => d.endpointId))).toEqual(new Set([a.id, b.id]));
  });

  it("swallows P2002 on a duplicate idempotency key (idempotent)", async () => {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Idem",
      url: "https://i.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    const first = await enqueueDeliveries({
      matches: [{ endpointId: ep.id, idempotencyKey: "evt-dup" }],
      eventType: "auth.signed-in",
      payload: {},
    });
    expect(first).toHaveLength(1);
    // Second call with the same idempotency key returns 0 created
    // rows ; the source mutation can be retried without spamming
    // the receiver.
    const second = await enqueueDeliveries({
      matches: [{ endpointId: ep.id, idempotencyKey: "evt-dup" }],
      eventType: "auth.signed-in",
      payload: {},
    });
    expect(second).toHaveLength(0);
  });
});

describe("webhooks/data delivery state transitions", () => {
  async function seedDelivery() {
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "Worker target",
      url: "https://w.test",
      description: null,
      secretHash: "h",
      subscriptions: [],
    });
    const [delivery] = await enqueueDeliveries({
      matches: [{ endpointId: ep.id, idempotencyKey: "evt-1" }],
      eventType: "auth.signed-in",
      payload: { userId: "u1" },
    });
    return { ep, delivery: delivery! };
  }

  it("listPendingDueDeliveries excludes future-scheduled rows", async () => {
    const { ep, delivery } = await seedDelivery();
    await markDeliveryRetry({
      deliveryId: delivery.id,
      endpointId: ep.id,
      // 10 minutes out — should not appear in the next sweep.
      nextAttemptAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 1,
      lastError: "first try",
    });
    const due = await listPendingDueDeliveries(50);
    expect(due.find((d) => d.id === delivery.id)).toBeUndefined();
  });

  it("markDeliverySucceeded clears the consecutive-failure counter", async () => {
    const { ep, delivery } = await seedDelivery();
    // Bump the failure counter first so we can prove the success
    // resets it.
    await markDeliveryRetry({
      deliveryId: delivery.id,
      endpointId: ep.id,
      nextAttemptAt: new Date(),
      attempts: 1,
      lastError: "first",
    });
    let after = await findEndpointById(ep.id);
    expect(after?.consecutiveFailures).toBe(1);

    await markDeliverySucceeded({
      deliveryId: delivery.id,
      endpointId: ep.id,
    });
    after = await findEndpointById(ep.id);
    expect(after?.consecutiveFailures).toBe(0);
    const db = getDb();
    const final = await db.webhookDelivery.findUnique({
      where: { id: delivery.id },
    });
    expect(final?.status).toBe("delivered");
    expect(final?.deliveredAt).not.toBeNull();
  });

  it("markDeliveryFailed bumps consecutiveFailures and stamps failedAt", async () => {
    const { ep, delivery } = await seedDelivery();
    await markDeliveryFailed({
      deliveryId: delivery.id,
      endpointId: ep.id,
      attempts: 5,
      lastError: "exhausted retries",
    });
    const after = await findEndpointById(ep.id);
    expect(after?.consecutiveFailures).toBe(1);
    const db = getDb();
    const final = await db.webhookDelivery.findUnique({
      where: { id: delivery.id },
    });
    expect(final?.status).toBe("failed");
    expect(final?.failedAt).not.toBeNull();
    expect(final?.attempts).toBe(5);
    expect(final?.lastError).toBe("exhausted retries");
  });

  it("disableEndpointForFailures flips the endpoint atomically", async () => {
    const { ep } = await seedDelivery();
    await disableEndpointForFailures({
      endpointId: ep.id,
      reason: "5 consecutive failures",
    });
    const after = await findEndpointById(ep.id);
    expect(after?.status).toBe("disabled");
    expect(after?.disabledAt).not.toBeNull();
    expect(after?.disabledReason).toBe("5 consecutive failures");
  });

  it("recordAttempt persists a row tied to the delivery with computed durationMs", async () => {
    const { delivery } = await seedDelivery();
    const startedAt = new Date(Date.now() - 250);
    const finishedAt = new Date();
    const attempt = await recordAttempt({
      deliveryId: delivery.id,
      attemptNumber: 1,
      startedAt,
      finishedAt,
      statusCode: 200,
      error: null,
    });
    expect(attempt.deliveryId).toBe(delivery.id);
    expect(attempt.statusCode).toBe(200);
    expect(attempt.durationMs).toBe(finishedAt.getTime() - startedAt.getTime());
  });
});
