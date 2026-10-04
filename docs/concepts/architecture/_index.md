---
type: landing
---

# Architecture

How the Monark codebase is put together: what a module is, the walls between modules and what enforces them, how modules talk, what is generated, and how the API and web app start. Read it before adding a module or changing how modules connect; the step-by-step versions are in [Extend Monark](../../build/extend/_index.md).

- [Modules and tiers](modules-and-tiers.md): what a module is, core versus extended, and how the repository is laid out.
- [Module boundaries](boundaries.md): the rules modules must not break, and the checks that catch a break.
- [The extensibility contract](extensibility-contract.md): what core guarantees to a new module, and what the module promises back.
- [The event bus](event-bus.md): how modules react to each other without importing each other, and where durability comes from.
- [Generated code](generated-code.md): the three artifacts built from module sources, and why CI rejects drift.
- [How the API boots](api-boot-sequence.md): the registration order, the routes it mounts, and the background work it starts.
- [The web app shell](web-app-shell.md): the navigation, app bar and shared screen patterns every page sits in.
- [Integration modules](integration-modules.md): how a third-party service plugs into automations as an ordinary extended module.
