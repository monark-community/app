import { WILDCARD_EVENT_TYPE, logger, on, type DomainEvent } from "@monark/common";
import {
  enqueueDeliveries,
  findMatchingEndpoints,
  findOnlySingletonOrgId,
  findUserMemberOrgIds,
} from "./data";
import { computeIdempotencyKey } from "./secrets";

let registered = false;

/**
 * Wires the webhook outbox into the in-memory event bus. Idempotent ;
 * calling twice (on hot-reload, in tests, etc.) is a no-op.
 *
 * The handler matches **every** domain event against the active
 * `WebhookSubscription` rows, then routes each candidate endpoint
 * through three rules in order :
 *
 *   1. **Platform-tier** (`endpoint.organizationId === null`)
 *      receives every matching event. Use case : sysadmin / SIEM /
 *      audit log integration that wants the firehose.
 *   2. **Direct org match** : if the event payload carries an
 *      `organizationId` and it equals the endpoint's, deliver. Use
 *      case : `organization.member-joined`,
 *      `rbac.role-assigned` for an org-tier grant, etc.
 *   3. **User-tied membership match** : if the event payload carries
 *      a `userId` but no `organizationId` (sign-in / sign-out /
 *      password change / TOTP changes / per-user notifications), look
 *      up the user's active org memberships once and fan out to every
 *      org-scoped endpoint whose org the user belongs to. Use case :
 *      "tell me when MY users sign in." Excludes former members
 *      (rows with `leftAt` set) so the routing matches the operator's
 *      mental model of "current org membership."
 *
 * Endpoints that match none of the rules are skipped silently ;
 * over-eager fan-out would surprise operators who explicitly scoped
 * their endpoint to one org. The membership lookup only runs when
 * (a) the event has no org id, (b) the event has a user id, and
 * (c) at least one org-scoped endpoint matched the event type — no
 * extra DB roundtrip when the routing answer is already determinate.
 */
export function registerWebhookSubscribers(): void {
  if (registered) return;
  registered = true;

  on(WILDCARD_EVENT_TYPE, async (event: DomainEvent) => {
    try {
      // Webhook events are themselves events on the bus ; skip them
      // so a delivery-failed notification doesn't recursively
      // generate webhook deliveries about itself. (Operators can
      // still subscribe explicitly via the `webhook.*` prefix if
      // they want this — they just have to opt in.)
      if (event.type.startsWith("webhook.")) return;

      const endpoints = await findMatchingEndpoints(event.type);
      if (endpoints.length === 0) return;

      // Type-narrow the event payload by duck-typing — the union of
      // every domain event includes a mix of shapes with different
      // optional fields. Pulling these out here keeps the routing
      // logic in one place.
      const eventOrgId =
        typeof (event as { organizationId?: unknown }).organizationId === "string"
          ? (event as { organizationId: string }).organizationId
          : null;
      const eventUserId =
        typeof (event as { userId?: unknown }).userId === "string"
          ? (event as { userId: string }).userId
          : null;

      // Lazy : only look up memberships if we have an org-scoped
      // endpoint that needs the lookup AND the event is user-tied
      // without an explicit org id. When the lookup comes back empty
      // (user has no formal `OrganizationMembership` row yet) we
      // also accept the singleton-org id, if exactly one org exists
      // ; covers the single-tenant deploy where direct sign-ups
      // pre-date the auto-membership subscriber + every sign-in
      // before the upsert lands.
      let userOrgIds: Set<string> | null = null;
      const needsMembershipLookup =
        eventOrgId === null &&
        eventUserId !== null &&
        endpoints.some((e) => e.organizationId !== null);
      if (needsMembershipLookup && eventUserId !== null) {
        const memberOrgIds = await findUserMemberOrgIds(eventUserId);
        if (memberOrgIds.length > 0) {
          userOrgIds = new Set(memberOrgIds);
        } else {
          const singleton = await findOnlySingletonOrgId();
          userOrgIds = singleton ? new Set([singleton]) : new Set();
        }
      }

      const correlationId = event.correlationId;
      const matches: Array<{ endpointId: string; idempotencyKey: string }> = [];
      for (const endpoint of endpoints) {
        // Rule 1 : platform-tier endpoint always receives.
        if (endpoint.organizationId === null) {
          // fall through to push
        }
        // Rule 2 : direct org match.
        else if (eventOrgId !== null && endpoint.organizationId === eventOrgId) {
          // fall through to push
        }
        // Rule 3 : user-tied membership match.
        else if (userOrgIds !== null && userOrgIds.has(endpoint.organizationId)) {
          // fall through to push
        } else {
          continue;
        }

        matches.push({
          endpointId: endpoint.id,
          idempotencyKey: computeIdempotencyKey({
            endpointId: endpoint.id,
            eventType: event.type,
            correlationId,
            payload: event,
          }),
        });
      }
      if (matches.length === 0) return;

      await enqueueDeliveries({
        matches,
        eventType: event.type,
        payload: event,
      });
    } catch (err) {
      // Never crash the emitter ; a webhook hiccup must not roll back
      // the source mutation. Log + move on ; the event is lost from
      // the webhook fan-out perspective but the source side-effect
      // is intact.
      logger.error(
        { err, eventType: event.type },
        "webhook subscriber failed to enqueue deliveries",
      );
    }
  });
}

export function _resetWebhookSubscribersForTesting(): void {
  registered = false;
}
