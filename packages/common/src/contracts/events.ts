export interface DomainEventBase {
  type: string
  occurredAt: Date
  correlationId?: string
}

export type { DomainEvent } from "./events.generated.js"
