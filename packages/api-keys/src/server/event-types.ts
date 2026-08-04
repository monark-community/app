import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the webhook subscription picker. Registering
// these makes the api-keys domain events webhook-subscribable. IMPORTANT: no
// event ever carries the key's plaintext or hash.
const API_KEYS_EVENT_TYPES = {
  "api-keys.key-created": {
    description: "A new API key was minted. The plaintext is never included.",
    fields: [
      { key: "organizationId", type: "string", description: "The organization the key acts in." },
      { key: "apiKeyId", type: "string", description: "The created key's id." },
      { key: "ownerUserId", type: "string", description: "The principal the key acts as." },
      { key: "actorId", type: "string", description: "The user who created the key." },
    ],
  },
  "api-keys.key-revoked": {
    description: "An API key was revoked and can no longer authenticate.",
    fields: [
      { key: "organizationId", type: "string", description: "The organization the key acted in." },
      { key: "apiKeyId", type: "string", description: "The revoked key's id." },
      { key: "actorId", type: "string", description: "The user who revoked the key." },
    ],
  },
  "api-keys.service-account-created": {
    description: "A service account (org-owned machine principal) was created.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the account belongs to.",
      },
      { key: "serviceAccountId", type: "string", description: "The machine principal's id." },
      { key: "name", type: "string", description: "The service account's display name." },
      { key: "roleIds", type: "string", description: "The roles granted to the account." },
      { key: "actorId", type: "string", description: "The admin who created the account." },
    ],
  },
  "api-keys.service-account-disabled": {
    description: "A service account was disabled ; its keys can no longer authenticate.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the account belongs to.",
      },
      { key: "serviceAccountId", type: "string", description: "The disabled account's id." },
      { key: "actorId", type: "string", description: "The admin who disabled the account." },
    ],
  },
} as const;

export function registerApiKeysEventTypes(): void {
  registerEventTypes("api-keys", API_KEYS_EVENT_TYPES);
}
