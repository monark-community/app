import type { DomainEvent } from "./contracts/events"
import { logger } from "./log"

type Handler<E extends DomainEvent> = (event: E) => Promise<void> | void

const handlers = new Map<string, Array<Handler<DomainEvent>>>()

export async function emit<E extends DomainEvent>(event: E): Promise<void> {
  const subs = handlers.get(event.type) ?? []
  for (const handler of subs) {
    try {
      await handler(event)
    } catch (error) {
      logger.error({ err: error, event: event.type }, "event handler failed")
    }
  }
}

export function on<E extends DomainEvent>(
  type: E["type"],
  handler: Handler<E>,
): void {
  const list = handlers.get(type) ?? []
  list.push(handler as Handler<DomainEvent>)
  handlers.set(type, list)
}

export function _resetHandlersForTesting(): void {
  handlers.clear()
}
