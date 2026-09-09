import { WILDCARD_EVENT_TYPE, logger, on, type DomainEvent } from "@monark/common";
import { getSingletonOrganization, getUserOrgs } from "@monark/organizations/server";
import { parseGraph } from "../contracts/graph";
import { DATA_RECORD_TRIGGER_TYPE } from "../contracts/triggers";
import { createPendingRun, findEnabledAutomationsForEvent, type AutomationRow } from "./data";

let registered = false;

/**
 * Resolve which org(s) an event belongs to, mirroring the webhooks subscriber's
 * routing: an event carrying `organizationId` is that org's ; a user-tied event
 * (only `userId`) fans out to the user's member orgs ; and an event with
 * neither is an instance-level fact (a storage bucket was created, a
 * platform-tier role was defined), which in a single-org deployment belongs to
 * the one org that exists.
 *
 * That last case used to return `[]`, which made a handful of trigger types
 * dead on arrival : the picker offered them, an operator wired a flow to one,
 * and it simply never fired — no error, no run row, nothing to explain it.
 * With more than one org live there is still no singleton to resolve to, the
 * event stays genuinely ambiguous, and `[]` remains the safe answer rather than
 * firing every org's flows on one org's event.
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
    if (orgs.length > 0) return orgs.map((o) => o.id);
    // Fall through : a user with no membership row yet (direct sign-ups
    // predating the auto-membership subscriber) still belongs to the
    // singleton org.
  }

  const singleton = await getSingletonOrganization();
  return singleton ? [singleton.id] : [];
}

/**
 * Whether a domain event may trigger automation runs. One place so the
 * run-enqueue handler below AND the editor's trigger picker (`eventTypes.list`
 * in router.ts) agree — the set of *offered* triggers can't drift from the set
 * that can actually *fire*. Excluded:
 *   - `automation.*` : ignored to avoid feedback loops — an automation triggered
 *     by its own run events (`automation.run-succeeded`, …) would re-fire forever.
 *   - `feature-flag.flipped` : its org / user lives nested under `scope`, not the
 *     top-level `resolveEventOrgIds` routes on. A flip aimed at one org would
 *     resolve to the singleton like any other org-less event rather than to the
 *     org it names, so with more than one org it would fire the wrong flows.
 *     Re-offering it means routing on the nested scope first ; until then it
 *     stays out of the picker.
 */
export function isTriggerableEventType(type: string): boolean {
  return !type.startsWith("automation.") && type !== "feature-flag.flipped";
}

/**
 * Events that CAN fire a run but are low-value / noisy as automation triggers
 * (internal plumbing, or admin config edits few would automate on), so the
 * editor's trigger picker hides them. This is **picker curation only** — the run
 * subscriber gates on `isTriggerableEventType`, not this, so an automation
 * already configured on one of these (e.g. via the API) still fires ; hiding it
 * from the picker never silently breaks a flow.
 */
const LOW_VALUE_TRIGGER_EVENTS: ReadonlySet<string> = new Set([
  "notification.created",
  "notification.preference-changed",
  "rbac.role-created",
  "rbac.role-updated",
  "rbac.role-deleted",
]);

/**
 * Whether the editor's trigger picker should OFFER this event : everything the
 * engine can fire on (`isTriggerableEventType`) minus the low-value events
 * above. Use this in the picker ; use `isTriggerableEventType` in the engine.
 */
export function isPickerTriggerEventType(type: string): boolean {
  return isTriggerableEventType(type) && !LOW_VALUE_TRIGGER_EVENTS.has(type);
}

/**
 * Whether an automation's trigger accepts THIS event's resource scope. Only the
 * Data Record trigger narrows scope : when its `dataModelKey` is set, the flow
 * fires only for records in that model. Everything else — the generic Event
 * Trigger on a record event, or any non-record event — matches unconditionally,
 * so scoping is purely additive and back-compatible. Fail-open : a malformed
 * graph or unset model matches, so a scoping hiccup can never silently drop a run.
 */
export function eventScopeMatches(row: AutomationRow, event: DomainEvent): boolean {
  if (!event.type.startsWith("data-models.record-")) return true;
  try {
    const trigger = parseGraph(row.graph).nodes.find((n) => n.type === DATA_RECORD_TRIGGER_TYPE);
    const modelKey =
      typeof trigger?.config.dataModelKey === "string" ? trigger.config.dataModelKey : "";
    if (!modelKey) return true;
    const eventModelKey =
      typeof (event as { dataModelKey?: unknown }).dataModelKey === "string"
        ? (event as { dataModelKey: string }).dataModelKey
        : "";
    return modelKey === eventModelKey;
  } catch {
    return true;
  }
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
      if (!isTriggerableEventType(event.type)) return;

      const orgIds = await resolveEventOrgIds(event);
      if (orgIds.length === 0) return;

      for (const orgId of orgIds) {
        const automations = await findEnabledAutomationsForEvent(orgId, event.type);
        for (const automation of automations) {
          if (!eventScopeMatches(automation, event)) continue;
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
