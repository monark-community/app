---
type: concept
---

# The extensibility contract

A new business module can ship without modifying core. Core exposes a set of runtime registries, each with a `register*` function the module calls once at API boot, and everything core does with those registrations (admin screens, webhooks, automations, search) follows automatically. This page states what each side can rely on.

## What core guarantees

| Extension point     | Register with                                                   | What you get without touching core                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Feature flags       | `registerFlags(module, flags)`                                  | Flags keyed `(module, key)`, checked as `isEnabled("<module>.<key>", scope)`, with the same user, role, organization and global overrides as core flags.                                               |
| Permissions         | `registerPermissions(module, perms)`                            | Permissions listed under **Roles & permissions** in the admin area automatically. Admins and system administrators are granted every permission without a backfill, so a new one never locks them out. |
| Notification kinds  | `registerNotificationKind(kind, def, messages)`                 | The whole dispatch path: preferences, locale, deduplication, the branded email shell, the in-app inbox. Payloads stay typed through declaration merging.                                               |
| Domain events       | a `XxxEvents` union in `contracts/events.ts`, plus the manifest | The event joins the generated `DomainEvent` union, so `emit` and `on` type-check it, and every emit reaches the webhook and automation subscribers.                                                    |
| Event-type metadata | `registerEventTypes(module, types)`                             | The event appears, with its description, in the webhook subscription picker and as an automation trigger whose payload fields authors can use.                                                         |
| Automation nodes    | `registerAutomationNodes(module, nodes)`                        | The node appears in the flow editor's palette and the engine can run it.                                                                                                                               |
| Search sources      | `registerSearchSource(source)`                                  | The module's entities appear in the global command palette, as their own group.                                                                                                                        |
| Metadata sidecar    | `setUserMetadataValue` / `setOrganizationMetadataValue`         | Per-user or per-organization JSON values with no migration, read and written through permissions the module registers.                                                                                 |
| Schema fragment     | `packages/<module>/prisma/<module>.prisma`                      | The module's own tables, assembled into the schema by `pnpm gen:schema`, with a migration the module owns.                                                                                             |

Registration is deliberately decoupled from the consumers. The webhooks module doesn't import Kanban to offer Kanban events; it reads the event-type registry. The command palette doesn't know which modules exist; it asks the search registry. That is what lets an extended module plug in with no edit outside its own package and the boot file.

Two of these registries also accept organization-scoped entries: per-model permissions and event types, which Data Models registers for each model an organization creates, are shown only to the organization that owns the model.

## What extended modules guarantee

- Registration is safe to repeat. A registry keyed by name replaces an existing entry instead of failing, so hot reloads, test setup and double imports don't crash boot.
- Shipped payloads stay stable. Once an event is emitted in production, its payload is a public API for webhook receivers and automations. Add fields; don't rename or remove them.
- Safe defaults: a new flag defaults off for new behaviour, and on only as a kill switch over behaviour that has already shipped.
- Module name is package name. `@monark/posts` registers its flags, permissions, kinds and events under `posts`.
- Every event type is registered. An event that is emitted but not registered still reaches webhooks, but operators can't find it in the picker and automation authors can't see its fields.

## What core does not guarantee

Core makes no promise to a module that crosses a [boundary](boundaries.md): one that depends on another extended module, edits core schema, writes to a registry directly, or registers under another module's namespace. That work belongs in core.

The event bus itself guarantees nothing about delivery. An in-process subscriber that fails is logged and skipped, and an event emitted right before a crash may never reach any subscriber. Durability comes from the webhook and automation outboxes; see [The event bus](event-bus.md).

## Testing an extension

Each registry exports a `_reset…ForTesting()` function, so a test can clear one registry in `beforeEach` and register only the slice it needs. Suites that boot the full registry instead rely on registration being repeatable. The step-by-step version is in [Write tests](../../build/extend/write-tests.md).

## Related

- [Open core registries to runtime registration](../../decisions/0003-open-core-registries-to-runtime-registration.md)
- [How the API boots](api-boot-sequence.md)
- [Domain events](../../reference/events.md)
- [Feature flags](../../reference/feature-flags.md)
