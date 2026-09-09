import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emit, on } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import type { DomainEvent } from "@monark/common/contracts/events";
import type { UserSignedInEvent, UserSignedUpEvent } from "@monark/auth/contracts";
import { getDb } from "@monark/db";

import {
  _resetOrganizationsSubscribersForTesting,
  ensureSingletonMembership,
  registerOrganizationsSubscribers,
} from "../../src/server/auto-membership";

// Single-tenant deploys implicitly land every signed-in user in the sole org
// (no invite needed). The rules: only when single-tenant + exactly one org,
// never re-joining a member the operator explicitly removed (`leftAt` set), and
// emitting `organization.member-joined` once on a fresh grant so notifications /
// webhooks see the same shape as an invite-driven join.

const ORG = "org-auto-membership";
const ORG2 = "org-auto-membership-2";
const USER = "org-auto-user";
const captured: DomainEvent[] = [];

async function resetAll(): Promise<void> {
  const db = getDb();
  await db.organizationMembership.deleteMany({});
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG2] } } });
  await db.user.deleteMany({ where: { id: USER } });
}

beforeEach(async () => {
  _resetHandlersForTesting();
  _resetOrganizationsSubscribersForTesting();
  captured.length = 0;
  on<DomainEvent>("organization.member-joined", (e) => void captured.push(e));
  await resetAll();
  await getDb().user.create({ data: { id: USER, email: `${USER}@test.local` } });
});

afterEach(resetAll);

const org = (id: string) =>
  getDb().organization.create({ data: { id, slug: id, displayName: id } });

describe("ensureSingletonMembership", () => {
  it("grants membership + emits member-joined once in single-tenant with exactly one org", async () => {
    await org(ORG);
    const granted = await ensureSingletonMembership(USER);
    expect(granted).toBe(true);
    const membership = await getDb().organizationMembership.findFirst({ where: { userId: USER } });
    expect(membership?.organizationId).toBe(ORG);
    expect(captured.map((e) => e.type)).toEqual(["organization.member-joined"]);
    expect((captured[0] as { userId?: string }).userId).toBe(USER);
  });

  it("is idempotent : a second call for an existing member is a no-op", async () => {
    await org(ORG);
    expect(await ensureSingletonMembership(USER)).toBe(true);
    captured.length = 0;
    expect(await ensureSingletonMembership(USER)).toBe(false);
    expect(captured).toHaveLength(0);
    expect(await getDb().organizationMembership.count({ where: { userId: USER } })).toBe(1);
  });

  it("does not re-join a member the operator removed (leftAt set)", async () => {
    await org(ORG);
    await getDb().organizationMembership.create({
      data: { userId: USER, organizationId: ORG, leftAt: new Date() },
    });
    expect(await ensureSingletonMembership(USER)).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("skips when the org count isn't exactly one", async () => {
    // Zero orgs.
    expect(await ensureSingletonMembership(USER)).toBe(false);
    // Two orgs → ambiguous singleton.
    await org(ORG);
    await org(ORG2);
    expect(await ensureSingletonMembership(USER)).toBe(false);
  });
});

describe("registerOrganizationsSubscribers", () => {
  it("auto-joins on user.signed-up and is idempotent on user.signed-in", async () => {
    await org(ORG);
    registerOrganizationsSubscribers();

    await emit({
      type: "user.signed-up",
      userId: USER,
      occurredAt: new Date(),
    } as UserSignedUpEvent);
    expect(await getDb().organizationMembership.count({ where: { userId: USER } })).toBe(1);

    // A later sign-in doesn't create a duplicate.
    await emit({
      type: "user.signed-in",
      userId: USER,
      occurredAt: new Date(),
    } as UserSignedInEvent);
    expect(await getDb().organizationMembership.count({ where: { userId: USER } })).toBe(1);
  });
});
