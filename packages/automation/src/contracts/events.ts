import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the automation module itself. Run-lifecycle events
// are registered in the event-type registry (event-types.ts) so operators can
// subscribe webhooks to them ; the automation subscriber deliberately ignores
// `automation.*` events as triggers to avoid feedback loops.

export type AutomationCreatedEvent = DomainEventBase & {
  type: "automation.created";
  automationId: string;
  organizationId: string;
  name: string;
  actorId: string;
};

export type AutomationUpdatedEvent = DomainEventBase & {
  type: "automation.updated";
  automationId: string;
  organizationId: string;
  actorId: string;
};

export type AutomationDeletedEvent = DomainEventBase & {
  type: "automation.deleted";
  automationId: string;
  organizationId: string;
  actorId: string;
};

export type AutomationRunStartedEvent = DomainEventBase & {
  type: "automation.run-started";
  automationId: string;
  runId: string;
  organizationId: string;
  triggerEventType: string;
};

export type AutomationRunSucceededEvent = DomainEventBase & {
  type: "automation.run-succeeded";
  automationId: string;
  runId: string;
  organizationId: string;
  triggerEventType: string;
  durationMs: number;
};

export type AutomationRunFailedEvent = DomainEventBase & {
  type: "automation.run-failed";
  automationId: string;
  runId: string;
  organizationId: string;
  triggerEventType: string;
  error: string;
};

export type AutomationEvents =
  | AutomationCreatedEvent
  | AutomationUpdatedEvent
  | AutomationDeletedEvent
  | AutomationRunStartedEvent
  | AutomationRunSucceededEvent
  | AutomationRunFailedEvent;
