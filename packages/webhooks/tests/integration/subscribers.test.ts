import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { emit } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import { createEndpoint } from "../../src/server/data";
import {
  registerWebhookSubscribers,
  _resetWebhookSubscribersForTesting,
} from "../../src/server/subscribers";

// Integration tests for the webhook subscribers — the layer between
// the in-memory event bus and the `WebhookDelivery` outbox table.
// The three routing rules (platform-tier firehose, direct-org match,
// user-tied membership match + singleton fallback) live here ; a
// regression either over-fans-out (privacy leak — endpoints in org A
// receive org B's events) or under-fans-out (operators stop getting
// alerts they explicitly subscribed to). Both are silent failures.
//
// Each spec emits one synthetic domain event (we shape it to match
// `DomainEvent`'s structural type) through the real bus, then asserts
// against the resulting `WebhookDelivery` rows. No mocking — the
// `findMatchingEndpoints` / `findUserMemberOrgIds` /
// `findOnlySingletonOrgId` calls go straight through to Postgres.

const ORG_A = "test-org-subs-a";
const ORG_B = "test-org-subs-b";
const USER_A = "test-subs-user-a";

beforeAll(async () => {
  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  await db.user.upsert({
    where: { id: USER_A },
    create: { id: USER_A, email: `${USER_A}@x.test` },
    update: {},
  });
});

beforeEach(() => {
  _resetHandlersForTesting();
  _resetWebhookSubscribersForTesting();
  registerWebhookSubscribers();
});

afterEach(async () => {
  // CASCADE cleans deliveries / attempts / subscriptions when the
  // parent endpoint goes ; truncate the parent. Memberships go too.
  await truncate(getDb(), ["WebhookEndpoint", "OrganizationMembership"]);
});

async function deliveriesForEndpoint(endpointId: string): Promise<number> {
  return getDb().webhookDelivery.count({ where: { endpointId } });
}

async function seedEndpoint(input: {
  organizationId: string | null;
  url?: string;
  eventType?: string;
  isPrefix?: boolean;
}): Promise<string> {
  const ep = await createEndpoint({
    organizationId: input.organizationId,
    name: input.url ?? `ep-${Math.random().toString(36).slice(2, 8)}`,
    url: input.url ?? "https://x.test/hook",
    description: null,
    secretHash: "hash",
    subscriptions: [
      {
        eventType: input.eventType ?? "auth.signed-in",
        isPrefix: input.isPrefix ?? false,
      },
    ],
  });
  return ep.id;
}

async function seedMembership(userId: string, orgId: string): Promise<void> {
  await getDb().organizationMembership.create({
    data: { userId, organizationId: orgId },
  });
}

describe("webhooks/subscribers — registration idempotency", () => {
  it("registering twice does not double-bind the wildcard handler", async () => {
    // The `beforeEach` already called register once ; call again.
    registerWebhookSubscribers();
    const platformEpId = await seedEndpoint({
      organizationId: null,
      eventType: "auth.signed-in",
    });
    await emit({
      type: "auth.signed-in",
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error — synthetic shape ; the runtime contract only
      // needs `type` + whatever the routing reads.
    });
    // If double-bound, we'd see 2 deliveries.
    expect(await deliveriesForEndpoint(platformEpId)).toBe(1);
  });
});

describe("webhooks/subscribers — recursion guard", () => {
  it("ignores webhook.* events so a delivery-failed alert doesn't fan out into more deliveries", async () => {
    const epId = await seedEndpoint({
      organizationId: null,
      eventType: "webhook.delivery-failed",
    });
    await emit({
      type: "webhook.delivery-failed",
      endpointId: epId,
      organizationId: null,
      endpointUrl: "https://x.test/hook",
      deliveryId: "d1",
      eventType: "auth.signed-in",
      attemptNumber: 5,
      permanent: true,
      reason: "HTTP 500",
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epId)).toBe(0);
  });
});

describe("webhooks/subscribers — no-match short-circuit", () => {
  it("does nothing when no endpoint subscribes to the event type", async () => {
    await seedEndpoint({
      organizationId: null,
      eventType: "auth.signed-in",
    });
    await emit({
      type: "rbac.role-assigned",
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    const total = await getDb().webhookDelivery.count();
    expect(total).toBe(0);
  });
});

describe("webhooks/subscribers — Rule 1 (platform-tier firehose)", () => {
  it("platform-tier endpoint receives an event with no org / no user payload", async () => {
    const epId = await seedEndpoint({
      organizationId: null,
      eventType: "system.heartbeat",
    });
    await emit({
      type: "system.heartbeat",
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epId)).toBe(1);
  });

  it("platform-tier endpoint receives an org-scoped event regardless of org id", async () => {
    const epId = await seedEndpoint({
      organizationId: null,
      eventType: "rbac.role-assigned",
    });
    await emit({
      type: "rbac.role-assigned",
      organizationId: ORG_A,
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epId)).toBe(1);
  });
});

describe("webhooks/subscribers — Rule 2 (direct org match)", () => {
  it("org-scoped endpoint receives an event whose organizationId matches", async () => {
    const epAId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "rbac.role-assigned",
    });
    await emit({
      type: "rbac.role-assigned",
      organizationId: ORG_A,
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epAId)).toBe(1);
  });

  it("org-scoped endpoint does NOT receive an event for a different org (privacy)", async () => {
    const epAId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "rbac.role-assigned",
    });
    await emit({
      type: "rbac.role-assigned",
      organizationId: ORG_B,
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epAId)).toBe(0);
  });
});

describe("webhooks/subscribers — Rule 3 (user-tied membership match)", () => {
  it("delivers a user-tied event (no orgId) to the org endpoint when the user is a member", async () => {
    await seedMembership(USER_A, ORG_A);
    const epAId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "auth.signed-in",
    });
    await emit({
      type: "auth.signed-in",
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epAId)).toBe(1);
  });

  it("does NOT deliver to an org endpoint when the user is not a member", async () => {
    // USER_A is a member of ORG_A only. The endpoint is at ORG_B.
    await seedMembership(USER_A, ORG_A);
    const epBId = await seedEndpoint({
      organizationId: ORG_B,
      eventType: "auth.signed-in",
    });
    await emit({
      type: "auth.signed-in",
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epBId)).toBe(0);
  });

  it("excludes ex-members (rows with leftAt set)", async () => {
    await getDb().organizationMembership.create({
      data: {
        userId: USER_A,
        organizationId: ORG_A,
        leftAt: new Date(),
      },
    });
    const epAId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "auth.signed-in",
    });
    await emit({
      type: "auth.signed-in",
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epAId)).toBe(0);
  });
});

describe("webhooks/subscribers — per-model subscription aliases", () => {
  // The Data Models engine emits ONE generic `data-models.record-created`
  // but carries per-model `subscriptionAliases` so an operator can subscribe
  // a webhook to a single model's records. The matcher treats
  // `[type, ...aliases]` as the candidate set.
  it("routes a generic record event to a per-model alias subscription", async () => {
    const epId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "data-models.project-record-created",
    });
    await emit({
      type: "data-models.record-created",
      dataModelId: "dm-project",
      dataModelKey: "project",
      recordId: "rec-1",
      organizationId: ORG_A,
      actorId: USER_A,
      occurredAt: new Date(),
      subscriptionAliases: ["data-models.project-record-created"],
    });
    expect(await deliveriesForEndpoint(epId)).toBe(1);
  });

  it("does NOT route to a different model's alias subscription", async () => {
    const epId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "data-models.invoice-record-created",
    });
    await emit({
      type: "data-models.record-created",
      dataModelId: "dm-project",
      dataModelKey: "project",
      recordId: "rec-1",
      organizationId: ORG_A,
      actorId: USER_A,
      occurredAt: new Date(),
      subscriptionAliases: ["data-models.project-record-created"],
    });
    expect(await deliveriesForEndpoint(epId)).toBe(0);
  });

  it("still matches a generic exact subscription to the base type", async () => {
    const epId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "data-models.record-created",
    });
    await emit({
      type: "data-models.record-created",
      dataModelId: "dm-project",
      dataModelKey: "project",
      recordId: "rec-1",
      organizationId: ORG_A,
      actorId: USER_A,
      occurredAt: new Date(),
      subscriptionAliases: ["data-models.project-record-created"],
    });
    expect(await deliveriesForEndpoint(epId)).toBe(1);
  });
});

describe("webhooks/subscribers — singleton-org fallback", () => {
  // `findOnlySingletonOrgId` returns the single non-deleted org id
  // when there's exactly one. The shared testcontainer hosts orgs
  // seeded by sibling test files (data.test.ts, worker.test.ts) plus
  // ORG_A and ORG_B from this file's `beforeAll`, so the default
  // count is > 1. We soft-delete every org except ORG_A for the
  // duration of these specs (the production query filters
  // `deletedAt: null`) and restore them in afterEach.
  let priorDeletedAt: Map<string, Date | null>;

  beforeEach(async () => {
    const db = getDb();
    const everyOrg = await db.organization.findMany({
      select: { id: true, deletedAt: true },
    });
    priorDeletedAt = new Map(everyOrg.map((o) => [o.id, o.deletedAt]));
    const now = new Date();
    for (const org of everyOrg) {
      if (org.id === ORG_A) continue;
      if (org.deletedAt !== null) continue;
      await db.organization.update({
        where: { id: org.id },
        data: { deletedAt: now },
      });
    }
  });

  afterEach(async () => {
    const db = getDb();
    // Restore each org's prior deletedAt — anything that was null at
    // entry goes back to null ; anything already soft-deleted stays
    // soft-deleted.
    for (const [id, deletedAt] of priorDeletedAt.entries()) {
      await db.organization.update({
        where: { id },
        data: { deletedAt },
      });
    }
  });

  it("delivers a user-tied event to the singleton org's endpoint when the user has no membership rows", async () => {
    const epAId = await seedEndpoint({
      organizationId: ORG_A,
      eventType: "auth.signed-in",
    });
    // No seedMembership call — `findUserMemberOrgIds` returns [], the
    // singleton fallback kicks in.
    await emit({
      type: "auth.signed-in",
      userId: USER_A,
      occurredAt: new Date(),
      // @ts-expect-error synthetic shape
    });
    expect(await deliveriesForEndpoint(epAId)).toBe(1);
  });
});
