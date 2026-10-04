---
type: concept
---

# Module boundaries

A small set of rules keeps modules removable and core stable. Each rule has a check behind it, and the checks run in CI, so a boundary is something the build refuses to cross rather than a convention to remember.

## The rules

Crossing any of these means the work belongs in core instead:

1. No extended module depends on another extended module. Compose through core: the event bus, a core read interface, or the metadata sidecar.
2. No extended module edits core schema. It keeps its tables in its own fragment, `packages/<module>/prisma/<module>.prisma`, and never touches `base.prisma` or the generated `schema.prisma`.
3. No module mutates a core registry directly. Flags, permissions, notification kinds, event types, automation nodes and search sources are added only through their `register*` functions. Reaching into a registry's internal map skips validation and boot ordering.
4. Nothing is renamed or repurposed once shipped. A domain event, flag, permission or notification kind keeps its meaning. New behaviour gets a new name under the module's own namespace.
5. Each side of the app imports only its side. The web app imports `/client` and `/contracts`; the API imports `/server` and `/contracts`.

When a design needs to break one of these rules, that is a signal about where the code belongs. Two extended modules that need each other's data usually share a concept that should live in core; a module that wants to change a core table is proposing a core change. Move the shared piece into core rather than adding an exception.

## What enforces them

| Check                | What it catches                                                                                                                                                                                                                                                                                                   | When it runs |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Package exports      | Any import of a path a package doesn't export fails to resolve.                                                                                                                                                                                                                                                   | typecheck    |
| ESLint boundary rule | `services/web` importing any `@monark/*/server`, or `services/api` importing any `@monark/*/client`.                                                                                                                                                                                                              | `pnpm lint`  |
| `pnpm check:tiers`   | An extended module that lists another extended module in `package.json` or imports one in source; an integration that doesn't depend on the module it declares it integrates; an extended module's `MODULE:` banner found in `base.prisma`.                                                                       | CI           |
| `pnpm check:modules` | A module missing from the manifest, or missing its README, its `contracts/events.ts`, or (when it has a router) an integration test suite. Deliberate, temporary exceptions are listed in `ACKNOWLEDGED_GAPS` in `tools/check-modules.ts`, and the check fails once a listed gap is closed but its entry remains. | CI           |
| Codegen drift        | A generated file that no longer matches its sources. See [Generated code](generated-code.md).                                                                                                                                                                                                                     | CI           |

## Rules no check enforces

Two rules rest on review alone:

- Namespacing: every registry is keyed by name, and registering the same name twice silently replaces the first entry. That is what makes registration safe to repeat, but it also means a module that registers under another module's namespace overwrites it with no error. Register only under your own module name, which should match the package name (`@monark/posts` registers under `posts`).
- Stable payloads: once an event ships, webhook receivers and automations parse its payload. Add fields; never rename or remove one.

## Related

- [Modules and tiers](modules-and-tiers.md)
- [The extensibility contract](extensibility-contract.md)
- [Add a module](../../build/extend/add-a-module.md)
- [Split modules into core and extended tiers](../../decisions/0001-split-modules-into-core-and-extended-tiers.md)
