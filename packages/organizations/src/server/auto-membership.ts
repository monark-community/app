import { emit, logger, on } from "@monark/common";
import type { UserSignedInEvent, UserSignedUpEvent } from "@monark/auth/contracts";
import { getDb } from "@monark/db";
import { countActiveOrganizations, findOnlyActiveOrganization } from "./data";
import type { MemberJoinedEvent } from "../contracts/events";

let registered = false;

/**
 * Idempotently grants the user a membership in the singleton org
 * when the deploy runs in single-tenant mode AND exactly one org
 * exists. Three short-circuit cases :
 *
 *   - Multi-tenant flag ON ⇒ no implicit membership ; users must
 *     accept an invite or be granted a role to belong to an org.
 *   - Org count != 1 ⇒ ambiguous singleton ; skip rather than guess.
 *   - User already has an active membership in the singleton ⇒ no-op
 *     (idempotent on every sign-in).
 *
 * On a fresh grant, also writes one `MemberJoinedEvent`
 * so downstream subscribers (notifications, webhooks) see the user
 * land in the org with the same shape as an invite-driven join.
 *
 * Returns true when a new membership row was inserted ; false on
 * every short-circuit + no-op path. Safe to call from every sign-in
 * — the membership lookup is a single index hit on
 * `(userId, organizationId)`.
 */
export async function ensureSingletonMembership(userId: string): Promise<boolean> {
  const orgCount = await countActiveOrganizations();
  if (orgCount !== 1) return false;

  const singleton = await findOnlyActiveOrganization();
  if (!singleton) return false;

  const db = getDb();
  const existing = await db.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: singleton.id },
    },
    select: { id: true, leftAt: true },
  });
  // Active membership : already in. `leftAt` set means the operator
  // explicitly removed them ; respect that — auto-join would
  // silently un-do an admin-initiated removal.
  if (existing && existing.leftAt === null) return false;
  if (existing && existing.leftAt !== null) return false;

  await db.organizationMembership.create({
    data: { userId, organizationId: singleton.id },
  });

  const event: MemberJoinedEvent = {
    type: "organization.member-joined",
    organizationId: singleton.id,
    userId,
    occurredAt: new Date(),
  };
  await emit(event).catch((err) => {
    logger.error(
      { err, userId, organizationId: singleton.id },
      "ensureSingletonMembership : member-joined emit failed",
    );
  });
  return true;
}

/**
 * Wires the auto-membership behavior to the auth bus. Listens for
 * `user.signed-up` (fresh accounts always need their first
 * membership) and `user.signed-in` (covers the single-tenant deploy
 * that flipped from multi back to single, or one where the singleton
 * was created after some users already existed). Idempotent ;
 * `ensureSingletonMembership` itself short-circuits when there's
 * nothing to do.
 *
 * Registered once at api boot from `services/api/src/server.ts`.
 * The membership lookup is the same single-index-hit query
 * `findUnique` runs every sign-in, so the perf impact is negligible.
 */
export function registerOrganizationsSubscribers(): void {
  if (registered) return;
  registered = true;

  on<UserSignedUpEvent>("user.signed-up", async (event) => {
    try {
      await ensureSingletonMembership(event.userId);
    } catch (err) {
      logger.error(
        { err, userId: event.userId },
        "ensureSingletonMembership on user.signed-up failed",
      );
    }
  });

  on<UserSignedInEvent>("user.signed-in", async (event) => {
    try {
      await ensureSingletonMembership(event.userId);
    } catch (err) {
      logger.error(
        { err, userId: event.userId },
        "ensureSingletonMembership on user.signed-in failed",
      );
    }
  });
}

export function _resetOrganizationsSubscribersForTesting(): void {
  registered = false;
}
