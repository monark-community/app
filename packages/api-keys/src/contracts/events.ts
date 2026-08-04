import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the api-keys module. gen:events picks up the
// ApiKeysEvents union by name. IMPORTANT: an event never carries the key's
// plaintext or hash — only its id, owner, org, and (on create) its scopes.

export type ApiKeyCreatedEvent = DomainEventBase & {
  type: "api-keys.key-created";
  organizationId: string;
  apiKeyId: string;
  ownerUserId: string;
  actorId: string;
};

export type ApiKeyRevokedEvent = DomainEventBase & {
  type: "api-keys.key-revoked";
  organizationId: string;
  apiKeyId: string;
  actorId: string;
};

export type ServiceAccountCreatedEvent = DomainEventBase & {
  type: "api-keys.service-account-created";
  organizationId: string;
  serviceAccountId: string;
  name: string;
  roleIds: string[];
  actorId: string;
};

export type ServiceAccountDisabledEvent = DomainEventBase & {
  type: "api-keys.service-account-disabled";
  organizationId: string;
  serviceAccountId: string;
  actorId: string;
};

export type ApiKeysEvents =
  | ApiKeyCreatedEvent
  | ApiKeyRevokedEvent
  | ServiceAccountCreatedEvent
  | ServiceAccountDisabledEvent;
