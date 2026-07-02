import type { DomainEvent } from "./contracts/events";
import { logger } from "./log";

type Handler<E extends DomainEvent> = (event: E) => Promise<void> | void;

const handlers = new Map<string, Array<Handler<DomainEvent>>>();
// Wildcard subscribers receive every emit. Registered with `on("*",
// handler)` ; used by the webhooks subscriber to fan out every event
// into the delivery outbox without enumerating types.
const wildcardHandlers: Array<Handler<DomainEvent>> = [];

export const WILDCARD_EVENT_TYPE = "*" as const;

export async function emit<E extends DomainEvent>(event: E): Promise<void> {
  const subs = handlers.get(event.type) ?? [];
  for (const handler of subs) {
    try {
      await handler(event);
    } catch (error) {
      logger.error({ err: error, event: event.type }, "event handler failed");
    }
  }
  for (const handler of wildcardHandlers) {
    try {
      await handler(event);
    } catch (error) {
      logger.error({ err: error, event: event.type }, "wildcard event handler failed");
    }
  }
}

export function on<E extends DomainEvent>(
  type: E["type"] | typeof WILDCARD_EVENT_TYPE,
  handler: Handler<E>,
): void {
  if (type === WILDCARD_EVENT_TYPE) {
    wildcardHandlers.push(handler as Handler<DomainEvent>);
    return;
  }
  const list = handlers.get(type) ?? [];
  list.push(handler as Handler<DomainEvent>);
  handlers.set(type, list);
}

export function _resetHandlersForTesting(): void {
  handlers.clear();
  wildcardHandlers.length = 0;
}
