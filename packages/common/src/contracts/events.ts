export interface DomainEventBase {
  type: string;
  occurredAt: Date;
  correlationId?: string;
  /**
   * Extra event-type strings this event should ALSO match for webhook
   * subscription routing, beyond its own `type`. Lets an emitter expose
   * finer-grained, subscribable "virtual" types without minting a new
   * `DomainEvent` union member for each (the union is codegen'd from
   * static per-module types and can't grow at runtime). The webhooks
   * matcher treats `[type, ...subscriptionAliases]` as the candidate set.
   *
   * Example : the polymorphic Data Models engine emits one generic
   * `data-models.record-created` but sets
   * `subscriptionAliases: ["data-models.<modelKey>-record-created"]` so an
   * operator can subscribe to a single model's records. Delivery still
   * carries the real `type` ; aliases only widen matching.
   */
  subscriptionAliases?: string[];
}

export type { DomainEvent } from "./events.generated";
