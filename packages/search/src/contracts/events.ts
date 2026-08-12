import type { DomainEventBase } from "@monark/common/contracts/events";

// Declare individual event types for this module here, then include them
// in the SearchEvents union. gen:events picks up this union by name.

export type SearchEvents = DomainEventBase & { type: never };
