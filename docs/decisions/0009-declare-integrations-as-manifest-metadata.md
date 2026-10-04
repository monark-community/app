---
type: decision
status: accepted
date: 2026-08-05
---

# 0009. Declare integrations as manifest metadata, not a new tier

## Context

With GitHub connected to automations and more providers planned (Telegram, Discord, X), a family of modules appeared that all do the same thing: plug a third-party service into the automation engine through its extension points. They shared plumbing (signature verification, connection routers, REST clients) that each was starting to copy, and it was tempting to group them in a folder or give them a tier of their own. But the build tooling assumes every package sits flat under `packages/`, and in dependency terms an integration is an ordinary extended module.

## Options

| Option                                                           | For                                                       | Against                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| A nested folder, `packages/integrations/<service>`               | Visible grouping                                          | Breaks the path conventions the tooling and TypeScript paths rely on |
| A third tier, "integration"                                      | Explicit in the manifest                                  | New tier rules for something that obeys the extended rules already   |
| An `integrates` field on extended modules, plus a shared library | No tooling change; grouping is queryable; plumbing shared | The grouping is invisible in the file tree                           |

## Decision

An integration is an extended module with `integrates: "@monark/automation"` in [the manifest](../../modules.manifest.ts). `pnpm check:tiers` additionally checks that it really depends on the module it names, so the metadata can't go stale. Shared plumbing lives in `@monark/integration-kit`, a library rather than a tiered module, and a provider-specific helper moves into it only when a second integration needs it.

The deciding reason: it groups integrations without inventing rules they don't need.

## Consequences

- New integrations follow the GitHub module as the reference and take only the kit pieces that fit their provider.
- Credentials go in the secrets store, so integrations usually own no tables.
- The kit stays small; one-off helpers (such as the OAuth 1.0a signer for X) stay in their module.
