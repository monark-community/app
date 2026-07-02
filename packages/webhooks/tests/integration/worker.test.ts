import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { on } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import {
  WEBHOOK_DELIVERY_BACKOFF_BASE_MS,
  WEBHOOK_DELIVERY_BACKOFF_MAX_MS,
  WEBHOOK_DELIVERY_FAILURE_LIMIT,
} from "../../src/contracts/index";
import {
  createEndpoint,
  enqueueDeliveries,
  type DeliveryWithEndpoint,
} from "../../src/server/data";
import { rememberSecret, _resetSecretStoreForTesting } from "../../src/server/secret-store";
import { deliverOne, tickOnce } from "../../src/server/worker";

// Integration tests for the webhook delivery worker — `tickOnce` (the
// outer loop) + `deliverOne` (one HTTP attempt against one endpoint).
// The worker is the load-bearing piece between the outbox table and
// the actual receiver ; a regression here either silently drops
// deliveries (`status` never moves off pending) or double-delivers
// (the idempotency / retry math goes off by one).
//
// `deliverOne` accepts an injectable `fetchImpl` so we can drive the
// real DB-side state machine + event emission against a fake HTTP
// surface ; no live receiver, no test fixtures of dummy servers.
// `tickOnce` is exercised end-to-end with `fetchImpl = fetch`
// monkey-patched at the global level via `vi.stubGlobal` because
// `tickOnce` doesn't accept a fetch override (worker-loop callers
// don't have one to pass).

const ORG_ID = "test-org-worker";

beforeAll(async () => {
  await getDb().organization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, slug: "test-org-worker", displayName: "Worker Org" },
    update: {},
  });
});

beforeEach(() => {
  _resetSecretStoreForTesting();
  _resetHandlersForTesting();
});

afterEach(async () => {
  // CASCADE clears subscriptions / deliveries / attempts when the
  // parent endpoint goes.
  await truncate(getDb(), ["WebhookEndpoint"]);
});

function captureEvents(): Array<{ type: string; payload: unknown }> {
  const events: Array<{ type: string; payload: unknown }> = [];
  on("*", (event) => {
    events.push({ type: event.type, payload: event });
  });
  return events;
}

async function seedEndpointWithDelivery(input: {
  endpointName?: string;
  url?: string;
  eventType?: string;
  idempotencyKey?: string;
}): Promise<{ endpointId: string; deliveryId: string }> {
  const ep = await createEndpoint({
    organizationId: ORG_ID,
    name: input.endpointName ?? "Worker Test",
    url: input.url ?? "https://example.test/hook",
    description: null,
    secretHash: "hash-placeholder",
    subscriptions: [{ eventType: input.eventType ?? "auth.signed-in", isPrefix: false }],
  });
  await rememberSecret(ep.id, "test-secret-plaintext");
  const [delivery] = await enqueueDeliveries({
    matches: [{ endpointId: ep.id, idempotencyKey: input.idempotencyKey ?? `idemp-${ep.id}` }],
    eventType: input.eventType ?? "auth.signed-in",
    payload: { sample: true },
  });
  return { endpointId: ep.id, deliveryId: delivery!.id };
}

async function loadDelivery(deliveryId: string): Promise<DeliveryWithEndpoint> {
  const row = await getDb().webhookDelivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  return row;
}

function fakeResponse(status: number): Response {
  // Minimal Response-shaped object — `deliverOne` only reads `.status`,
  // so anything else can stay undefined. Casting through unknown
  // keeps TypeScript happy without pulling in undici types.
  return { status } as unknown as Response;
}

describe("webhooks/worker tickOnce", () => {
  it("returns processed=0 when nothing is due", async () => {
    const result = await tickOnce();
    expect(result.processed).toBe(0);
  });

  it("processes a pending due delivery against a 200 receiver", async () => {
    const { endpointId, deliveryId } = await seedEndpointWithDelivery({});
    const fetchSpy = async () => fakeResponse(200);
    // Stub the global `fetch` so `tickOnce` (which doesn't accept a
    // fetch override) routes through our spy. We restore via the
    // beforeEach reset in the next case ; vitest's auto-restore
    // would also kick in but spelling it out keeps the cleanup
    // explicit.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      const result = await tickOnce(10);
      expect(result.processed).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const after = await loadDelivery(deliveryId);
    expect(after.status).toBe("delivered");
    const ep = await getDb().webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    expect(ep.consecutiveFailures).toBe(0);
  });
});

describe("webhooks/worker deliverOne — success path", () => {
  it("records the attempt + marks delivery succeeded + emits webhook.delivery-succeeded on 2xx", async () => {
    const events = captureEvents();
    const { endpointId, deliveryId } = await seedEndpointWithDelivery({
      eventType: "auth.signed-in",
    });
    const delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => fakeResponse(200));

    const after = await loadDelivery(deliveryId);
    expect(after.status).toBe("delivered");
    expect(after.deliveredAt).not.toBeNull();
    // `WebhookDelivery.attempts` is only bumped on retry / fail —
    // success terminates the delivery so the parent counter stays
    // at 0. The attempt number is captured on the
    // `WebhookDeliveryAttempt` row instead (asserted below).

    const attempts = await getDb().webhookDeliveryAttempt.findMany({
      where: { deliveryId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.statusCode).toBe(200);
    expect(attempts[0]?.error).toBeNull();

    const ep = await getDb().webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    expect(ep.consecutiveFailures).toBe(0);

    const success = events.find((e) => e.type === "webhook.delivery-succeeded");
    expect(success).toBeDefined();
    expect((success!.payload as { deliveryId: string }).deliveryId).toBe(deliveryId);
    expect((success!.payload as { attemptNumber: number }).attemptNumber).toBe(1);
  });
});

describe("webhooks/worker deliverOne — retry path", () => {
  it("records the attempt + marks retry + emits webhook.delivery-failed{permanent:false} on 4xx", async () => {
    const events = captureEvents();
    const { endpointId, deliveryId } = await seedEndpointWithDelivery({});
    const delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => fakeResponse(429));

    const after = await loadDelivery(deliveryId);
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBe("HTTP 429");
    expect(after.nextAttemptAt).not.toBeNull();
    expect(after.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    const ep = await getDb().webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    expect(ep.consecutiveFailures).toBe(1);

    const failed = events.find((e) => e.type === "webhook.delivery-failed");
    expect(failed).toBeDefined();
    expect((failed!.payload as { permanent: boolean }).permanent).toBe(false);
  });

  it("records the attempt with statusCode + marks retry on 5xx", async () => {
    const { deliveryId } = await seedEndpointWithDelivery({});
    const delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => fakeResponse(503));
    const attempts = await getDb().webhookDeliveryAttempt.findMany({
      where: { deliveryId },
    });
    expect(attempts[0]?.statusCode).toBe(503);
    expect(attempts[0]?.error).toBe("HTTP 503");
  });

  it("records a network error + marks retry when fetch itself throws", async () => {
    const { deliveryId } = await seedEndpointWithDelivery({});
    const delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => {
      throw new Error("ECONNRESET");
    });
    const after = await loadDelivery(deliveryId);
    expect(after.status).toBe("pending");
    expect(after.lastError).toBe("ECONNRESET");
    const attempts = await getDb().webhookDeliveryAttempt.findMany({
      where: { deliveryId },
    });
    expect(attempts[0]?.statusCode).toBeNull();
    expect(attempts[0]?.error).toBe("ECONNRESET");
  });

  it("records an attempt with error when no secret is available for the endpoint", async () => {
    // Deliberately do NOT call rememberSecret — the seed helper does,
    // so we manually create here.
    const ep = await createEndpoint({
      organizationId: ORG_ID,
      name: "no-secret",
      url: "https://example.test/hook",
      description: null,
      secretHash: "hash",
      subscriptions: [{ eventType: "auth.signed-in", isPrefix: false }],
    });
    const [delivery] = await enqueueDeliveries({
      matches: [{ endpointId: ep.id, idempotencyKey: "idemp-no-secret" }],
      eventType: "auth.signed-in",
      payload: {},
    });
    const full = await loadDelivery(delivery!.id);
    // fetch is never reached because resolveSecret returns null first ;
    // the assertion is that we still record + retry instead of
    // crashing.
    await deliverOne(full, async () => fakeResponse(200));
    const after = await loadDelivery(delivery!.id);
    expect(after.status).toBe("pending");
    expect(after.lastError).toContain("no plaintext secret");
  });

  it("uses exponential backoff for nextAttemptAt — base ms × 2^(attempt-1), capped at the max", async () => {
    const { deliveryId } = await seedEndpointWithDelivery({});

    // First attempt → base × 1
    let delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => fakeResponse(500));
    delivery = await loadDelivery(deliveryId);
    const after1 = delivery.nextAttemptAt!.getTime() - Date.now();
    expect(after1).toBeGreaterThan(WEBHOOK_DELIVERY_BACKOFF_BASE_MS - 1000);
    expect(after1).toBeLessThanOrEqual(WEBHOOK_DELIVERY_BACKOFF_BASE_MS + 5000);

    // Second attempt → base × 2 (still well under the max). Reset
    // nextAttemptAt to "due now" so the next deliverOne call doesn't
    // bail on its own scheduling (deliverOne doesn't check
    // nextAttemptAt, but listPendingDueDeliveries does — irrelevant
    // here since we call deliverOne directly).
    await deliverOne(delivery, async () => fakeResponse(500));
    delivery = await loadDelivery(deliveryId);
    const after2 = delivery.nextAttemptAt!.getTime() - Date.now();
    expect(after2).toBeGreaterThan(WEBHOOK_DELIVERY_BACKOFF_BASE_MS * 2 - 1000);
    expect(after2).toBeLessThanOrEqual(WEBHOOK_DELIVERY_BACKOFF_BASE_MS * 2 + 5000);
    // Sanity : at no point in the curve do we exceed the cap.
    expect(after2).toBeLessThan(WEBHOOK_DELIVERY_BACKOFF_MAX_MS);
  });
});

describe("webhooks/worker deliverOne — exhausted retries", () => {
  it("marks delivery failed{permanent:true} + auto-disables endpoint after the failure limit", async () => {
    const events = captureEvents();
    const { endpointId, deliveryId } = await seedEndpointWithDelivery({});

    // Drive `attemptNumber` up to the failure limit by incrementing
    // the row's attempts directly between fake calls — `deliverOne`
    // reads `delivery.attempts` and uses `attempts + 1` as the new
    // attempt number, branching to the permanent-failure path when
    // `attemptNumber >= WEBHOOK_DELIVERY_FAILURE_LIMIT`. Cheaper than
    // calling `deliverOne` `WEBHOOK_DELIVERY_FAILURE_LIMIT` times.
    await getDb().webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: WEBHOOK_DELIVERY_FAILURE_LIMIT - 1 },
    });
    // Same for the endpoint's consecutiveFailures so the auto-disable
    // branch fires (`maybeAutoDisable` checks the endpoint's counter,
    // not the delivery's).
    await getDb().webhookEndpoint.update({
      where: { id: endpointId },
      data: { consecutiveFailures: WEBHOOK_DELIVERY_FAILURE_LIMIT - 1 },
    });

    const delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => fakeResponse(500));

    const after = await loadDelivery(deliveryId);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(WEBHOOK_DELIVERY_FAILURE_LIMIT);
    expect(after.lastError).toBe("HTTP 500");

    const ep = await getDb().webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    expect(ep.status).toBe("disabled");
    expect(ep.disabledReason).toContain("auto-disabled");

    const permanent = events.find(
      (e) =>
        e.type === "webhook.delivery-failed" &&
        (e.payload as { permanent: boolean }).permanent === true,
    );
    expect(permanent).toBeDefined();

    const disabled = events.find((e) => e.type === "webhook.endpoint-disabled-after-failures");
    expect(disabled).toBeDefined();
    expect((disabled!.payload as { consecutiveFailures: number }).consecutiveFailures).toBe(
      WEBHOOK_DELIVERY_FAILURE_LIMIT,
    );
  });

  it("does NOT re-disable an already-disabled endpoint", async () => {
    const { endpointId, deliveryId } = await seedEndpointWithDelivery({});
    // Pre-disable the endpoint manually + push the failure counter past
    // the limit. The auto-disable branch should bail early on the
    // `status !== "active"` guard.
    await getDb().webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        status: "disabled",
        disabledReason: "manual",
        consecutiveFailures: WEBHOOK_DELIVERY_FAILURE_LIMIT,
      },
    });
    await getDb().webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: WEBHOOK_DELIVERY_FAILURE_LIMIT - 1 },
    });

    const events = captureEvents();
    const delivery = await loadDelivery(deliveryId);
    await deliverOne(delivery, async () => fakeResponse(500));

    const ep = await getDb().webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    // disabledReason still reads "manual" — the auto-disable path
    // didn't overwrite it.
    expect(ep.disabledReason).toBe("manual");
    const disabled = events.find((e) => e.type === "webhook.endpoint-disabled-after-failures");
    expect(disabled).toBeUndefined();
  });
});
