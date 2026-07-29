import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the webhook subscription picker. Registering
// these makes every secrets domain event webhook-subscribable. IMPORTANT: no
// event ever carries the secret's value — only its name (`key`) and the org.
const SECRETS_EVENT_TYPES = {
  "secrets.created": {
    description: "A new organization secret was created. The value is never included.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the secret belongs to.",
      },
      { key: "key", type: "string", description: "The secret's name (never its value)." },
      { key: "actorId", type: "string", description: "The user who created the secret." },
    ],
  },
  "secrets.updated": {
    description: "An existing organization secret's value or description was updated.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the secret belongs to.",
      },
      { key: "key", type: "string", description: "The secret's name (never its value)." },
      { key: "actorId", type: "string", description: "The user who updated the secret." },
    ],
  },
  "secrets.deleted": {
    description: "An organization secret was deleted.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the secret belonged to.",
      },
      { key: "key", type: "string", description: "The deleted secret's name." },
      { key: "actorId", type: "string", description: "The user who deleted the secret." },
    ],
  },
} as const;

export function registerSecretsEventTypes(): void {
  registerEventTypes("secrets", SECRETS_EVENT_TYPES);
}
