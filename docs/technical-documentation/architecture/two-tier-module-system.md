# Two-tier module system

Every business domain lives in its own workspace package (`@monark/auth`, `@monark/rbac`, `@monark/webhooks`, etc.). Packages are split into two tiers :

| Tier             | Members                                                                                                                                           | Rules                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core** (14)    | auth, users, organizations, rbac, feature-flags, notifications, webhooks, data-models, automation, secrets, files, api-keys, public-api, branding | Coupled ; may depend on each other. Ship with every deploy ; cannot be removed without breaking the app.                                      |
| **Extended** (2) | calendar, kanban                                                                                                                                  | Self-contained ; may depend on core but never on another extended module. Removing one compiles and passes tests with zero changes to others. |

The tier assignment lives in `modules.manifest.ts` at the repo root ; `pnpm check:tiers` enforces the dependency rules at CI time. (The list above is the current membership ; [platform-overview.md](../platform-overview/_index.md) is the authoritative inventory.)
