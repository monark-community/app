import { WILDCARD_EVENT_TYPE, logger, on, type DomainEvent } from "@monark/common";
import { getUserOrgs } from "@monark/organizations/server";
import { createPendingRun, findEnabledAutomationsForEvent } from "./data";

let registered = false;

/**
 * Resolve which org(s) an event belongs to, mirroring the webhooks subscriber's
 * routing: an event carrying `organizationId` is that org's ; a user-tied event
 * (only `userId`) fans out to the user's member orgs. Events with neither are
 * unroutable to an org and match nothing.
 */
async function resolveEventOrgIds(event: DomainEvent): Promise<string[]> {
  const orgId =
    typeof (event as { organizationId?: unknown }).organizationId === "string"
      ? (event as { organizationId: string }).organizationId
      : null;
  if (orgId) return [orgId];

  const userId =
    typeof (event as { userId?: unknown }).userId === "string"
      ? (event as { userId: string }).userId
      : null;
  if (userId) {
    const orgs = await getUserOrgs(userId);
    return orgs.map((o) => o.id);
  }
  return [];
}

/**
 * Wire the automation trigger engine into the event bus. Idempotent. The
 * handler does only cheap work — resolve the event's org(s), find enabled
 * automations whose `triggerEventType` matches, and insert one PENDING
 * `AutomationRun` (the outbox row) each — then returns. The worker executes the
 * graphs out of band, so a slow flow never blocks the request that emitted the
 * event. `automation.*` events are ignored as triggers to avoid feedback loops.
 *
 * Registered BEFORE the webhook subscriber in `services/api/src/server.ts` so
 * both wildcard handlers fire in a stable order.
 */
export function registerAutomationSubscribers(): void {
  if (registered) return;
  registered = true;

  on(WILDCARD_EVENT_TYPE, async (event: DomainEvent) => {
    try {
      if (event.type.startsWith("automation.")) return;

      const orgIds = await resolveEventOrgIds(event);
      if (orgIds.length === 0) return;

      for (const orgId of orgIds) {
        const automations = await findEnabledAutomationsForEvent(orgId, event.type);
        for (const automation of automations) {
          await createPendingRun({
            automationId: automation.id,
            organizationId: orgId,
            triggerEventType: event.type,
            triggerPayload: event,
            manual: false,
            createdBy: automation.createdBy,
          });
        }
      }
    } catch (err) {
      // Never crash the emitter — a trigger-matching hiccup must not roll back
      // the source mutation. Log + move on.
      logger.error({ err, eventType: event.type }, "automation subscriber failed to enqueue runs");
    }
  });
}

export function _resetAutomationSubscribersForTesting(): void {
  registered = false;
}
