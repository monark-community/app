---
type: decision
status: accepted
date: 2026-05-07
---

# 0003. Open core registries to runtime registration

## Context

Feature flags, permissions and notification kinds started as closed, static lists in core (`const FLAGS`, `const PERMISSIONS`, `const NOTIFICATION_KINDS`). Adding a flag or a permission for a new module meant editing a core file, which broke the promise that an extended module ships without modifying core, and made those files a merge point for every feature. Flags and permissions were also keyed by a single string, so two modules choosing the same key would collide.

## Options

| Option                                                       | For                                                                                | Against                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Keep static lists; modules send a core change for each entry | Everything visible in one file; typed keys                                         | Every module edits core; the extended tier's promise doesn't hold                       |
| Generate the lists from each module at build time            | Typed, complete lists with no core edit                                            | Another generator to run and drift-check; descriptions and templates still need a home  |
| Runtime registries, filled by each module at API boot        | No core edit; one pattern for every registry; admin screens list what's registered | Keys are checked at runtime, not compile time; boot order becomes something to maintain |

## Decision

Each registry became a runtime map with a `register*` function: `registerFlags(module, …)`, `registerPermissions(module, …)`, `registerNotificationKind(kind, …)`. Identity is the pair `(module, key)`, stored as such in the database, and call sites use the dotted form `"<module>.<key>"`. Every module calls its own registration helper from the API's boot file. Notification payloads stay typed through declaration merging. A generic per-user and per-organization metadata sidecar shipped in the same change, so a module can store small settings without a schema change.

The deciding reason: it makes "ship a module without touching core" true for the three things almost every module needs.

## Consequences

- The same pattern was reused for every later extension point: event types, automation nodes, search sources, model integrations.
- Admin screens, the webhook picker and the automation editor list whatever is registered, so a new module appears in them with no UI change.
- Nothing catches a namespace collision at runtime: registering an existing key replaces it. Namespacing by module name is a convention reviewers enforce.
- The boot file lists every module's `register*` calls by hand and has to be kept in a working order.
