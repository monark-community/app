# Two-tier module system

Every business domain lives in its own workspace package (`@monark/auth`, `@monark/rbac`, `@monark/webhooks`, etc.). Packages are split into two tiers :

| Tier             | Members                                                                                                                                                         | Rules                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core** (16)    | auth, branding, feature-flags, users, organizations, rbac, notifications, webhooks, files, data-models, automation, secrets, api-keys, public-api, chat, search | Coupled ; may depend on each other. Ship with every deploy ; cannot be removed without breaking the app.                                      |
| **Extended** (8) | calendar, kanban, wiki, achievements, github, discord, telegram, twitter                                                                                        | Self-contained ; may depend on core but never on another extended module. Removing one compiles and passes tests with zero changes to others. |

![The two tiers : extended modules depend downward on core, never sideways on each other, and both reach the platform substrate by registering at boot rather than by importing it.](../../assets/module-tiers.svg)

The tier assignment lives in `modules.manifest.ts` at the repo root ; `pnpm check:tiers` enforces the dependency rules at CI time. (The list above is the current membership ; [platform-overview.md](../platform-overview/_index.md) is the authoritative inventory.)
