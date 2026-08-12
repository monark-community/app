import { WILDCARD_EVENT_TYPE, logger, on, type DomainEvent } from "@monark/common";
import { enqueueOutbox, hasEnabledRuleForEvent } from "./data";

let registered = false;

/**
 * Wildcard event subscriber : on every domain event, cheaply check whether the
 * event's org has any enabled rule watching this type (or one of its aliases) ;
 * if so, persist the event to the durable {@link AchievementOutbox}. The worker
 * drains the outbox out of band and does the (heavier) crediting / awarding, so
 * a slow evaluation never blocks the mutation that emitted the event, and a
 * restart never drops a count. Wrapped so a hiccup can't roll back the emitter.
 */
export function registerAchievementsSubscriber(): void {
  if (registered) return;
  registered = true;

  on(WILDCARD_EVENT_TYPE, async (event: DomainEvent) => {
    try {
      const organizationId = (event as unknown as Record<string, unknown>).organizationId;
      if (typeof organizationId !== "string") return; // can't scope without an org
      const eventTypes = [event.type, ...(event.subscriptionAliases ?? [])];
      if (!(await hasEnabledRuleForEvent(organizationId, eventTypes))) return;
      await enqueueOutbox({ organizationId, eventType: event.type, payload: event });
    } catch (err) {
      logger.error({ err, eventType: event.type }, "achievements subscriber failed to enqueue");
    }
  });
}

export function _resetAchievementsSubscriberForTesting(): void {
  registered = false;
}
