import { registerFlags } from "@monark/feature-flags/server";

// Tenancy + bootstrap flags owned by the organizations module. The
// namespace is `tenancy.*` (kept after the module-namespace refactor
// for continuity with the existing flag key + override rows backfilled
// to `module = 'organizations'` in the migration).
const TENANCY_FLAGS = {
  // Stored under the `tenancy` namespace for ergonomics — tenancy is
  // the user-facing concept, even though the owning module is
  // `organizations`. The DB uses module = 'organizations' for these
  // rows ; the registry exposes them under whatever module the
  // caller passes here.
  "multi-tenant": {
    description:
      "When ON, the app accepts multiple organizations and self-service org creation. When OFF (default), the app runs in single-tenant mode : exactly one Organization is expected, every route gates to /setup until that org exists, and the admin UX collapses around the single-org assumption.",
    defaultOn: false,
  },
} as const;

export function registerOrganizationsFeatureFlags(): void {
  registerFlags("tenancy", TENANCY_FLAGS);
}
