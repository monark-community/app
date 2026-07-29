import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the secrets module. gen:events picks up the
// SecretsEvents union by name. IMPORTANT: the secret VALUE is never carried on
// any event — only the key (name), the org, and the acting user.

export type SecretCreatedEvent = DomainEventBase & {
  type: "secrets.created";
  organizationId: string;
  key: string;
  actorId: string;
};

export type SecretUpdatedEvent = DomainEventBase & {
  type: "secrets.updated";
  organizationId: string;
  key: string;
  actorId: string;
};

export type SecretDeletedEvent = DomainEventBase & {
  type: "secrets.deleted";
  organizationId: string;
  key: string;
  actorId: string;
};

export type SecretsEvents = SecretCreatedEvent | SecretUpdatedEvent | SecretDeletedEvent;
