import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the public-api module (namespace `public-api.*`).
const PUBLIC_API_FLAGS = {
  enabled: {
    description:
      "The public REST API (/api/v1). Master kill switch ; when off, every /api/v1 route (and the OpenAPI doc) responds 404 regardless of a valid API key. Off by default until the surface is rolled out.",
    defaultOn: false,
  },
  "service-accounts": {
    description:
      "Org-owned service accounts (machine principals) and their API keys, managed at /admin/service-accounts. Off by default ; independent of the user-key surface so v2 can ship dark.",
    defaultOn: false,
  },
} as const;

/** The dotted flag key checked per request before serving any /api/v1 route. */
export const PUBLIC_API_ENABLED_FLAG = "public-api.enabled";

/** Gates the service-account (v2) admin surface + management procedures. */
export const PUBLIC_API_SERVICE_ACCOUNTS_FLAG = "public-api.service-accounts";

export function registerPublicApiFeatureFlags(): void {
  registerFlags("public-api", PUBLIC_API_FLAGS);
}
