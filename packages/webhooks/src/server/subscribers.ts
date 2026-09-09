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
 *   3. **Resolved org match** : the event carries no `organizationId`,
 *      so the org is worked out instead. If the payload has a `userId`
 *      (sign-in / sign-out / password change / TOTP changes / per-user
 *      notifications), that user's active org memberships decide it —
 *      fan out to every org-scoped endpoint whose org the user belongs
 *      to. Use case : "tell me when MY users sign in." Former members
 *      (rows with `leftAt` set) are excluded, so the routing matches
 *      the operator's mental model of "current org membership."
 *      Otherwise — or when the user has no membership row yet — the
 *      event is instance-level (a global feature flag was flipped, a
 *      storage bucket was created, a platform-tier role was defined),
 *      and in a single-org deployment an instance-level fact belongs
 *      to the one org that exists.
 *
 * Rule 3 covering the org-less, user-less case is what makes routing
 * **total** : before, an event with neither id reached platform-tier
 * endpoints only, so an operator could subscribe an org-scoped
 * endpoint to `feature-flag.flipped` and silently receive nothing,
 * with no error anywhere to explain it. Events genuinely without an
 * org are rare and instance-wide by nature ; delivering them to the
 * single org's endpoints is what an operator expects, and with more
 * than one org present the resolution finds none and the old skip
 * still applies.
 *
 * Endpoints that match none of the rules are skipped silently ;
 * over-eager fan-out would surprise operators who explicitly scoped
 * their endpoint to one org. The resolution only runs when (a) the
 * event has no org id and (b) at least one org-scoped endpoint matched
 * the event type — no extra DB roundtrip when the routing answer is
 * already determinate.
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

      // Match on the event's own type plus any `subscriptionAliases` it
      // exposes — an emitter can offer finer-grained subscribable types
      // (e.g. per-Data-Model record events) without a new union member.
      const aliases = Array.isArray(
        (event as { subscriptionAliases?: unknown }).subscriptionAliases,
      )
        ? (event as { subscriptionAliases: string[] }).subscriptionAliases
        : [];
      const candidateTypes = [event.type, ...aliases];

      const endpoints = await findMatchingEndpoints(candidateTypes);
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

      // Lazy : only resolve an org when the event doesn't carry one AND
      // an org-scoped endpoint is actually waiting on the answer.
      //
      // A user id, when present, is the better signal — it says which
      // orgs this event is about. Falling back to the singleton org
      // covers two cases that both mean "this belongs to the only org
      // there is" : a user with no formal `OrganizationMembership` row
      // yet (direct sign-ups predating the auto-membership subscriber,
      // and every sign-in before that upsert lands), and an event with
      // no user at all because the fact is instance-level.
      let resolvedOrgIds: Set<string> | null = null;
      const needsOrgResolution =
        eventOrgId === null && endpoints.some((e) => e.organizationId !== null);
      if (needsOrgResolution) {
        const memberOrgIds = eventUserId !== null ? await findUserMemberOrgIds(eventUserId) : [];
        if (memberOrgIds.length > 0) {
          resolvedOrgIds = new Set(memberOrgIds);
        } else {
          const singleton = await findOnlySingletonOrgId();
          resolvedOrgIds = singleton ? new Set([singleton]) : new Set();
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
        // Rule 3 : resolved org match.
        else if (resolvedOrgIds !== null && resolvedOrgIds.has(endpoint.organizationId)) {
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
