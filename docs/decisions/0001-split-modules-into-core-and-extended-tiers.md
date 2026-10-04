---
type: decision
status: accepted
date: 2026-04-22
---

# 0001. Split modules into core and extended tiers

## Context

Monark had to host two kinds of code with opposite needs. Identity, permissions, flags and communications are needed by every feature and change rarely. Business features such as contribution tracking, voting or boards change often, and a given deployment may not want them at all. If the boundaries were left to convention, business features would quietly couple to each other, and removing or rewriting one would ripple through the rest. The decision had to come first, because every later module inherits it.

## Options

| Option                                                                | For                                                                   | Against                                                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| One application with folders per feature                              | Simplest to start; no packaging overhead                              | Nothing stops a feature reaching into another's internals; boundaries erode under deadline pressure |
| A runtime plugin system                                               | Features could be installed per deployment without a rebuild          | A loader, versioned plugin API and isolation to build and maintain before any feature ships         |
| Workspace packages in two tiers, with the rules checked at build time | Boundaries enforced by module resolution and CI; no runtime machinery | Every module is still compiled into every build; cross-cutting changes touch several packages       |

## Decision

Each feature is a workspace package with only `/server`, `/client` and `/contracts` entry points, listed in a manifest with a tier. Core modules may depend on each other; extended modules may depend on core but never on another extended module. Extended modules talk to each other only through the event bus, core read interfaces and core registries. `pnpm check:tiers` enforces the dependency rule in CI.

The deciding reason: package boundaries make "don't reach into another module" a resolution failure, so the rule holds without anyone policing it, and no plugin runtime is needed.

## Consequences

- Any extended module can be removed or rewritten without touching the others.
- Two extended modules that need shared state can't import each other; the shared concept has to move into core, which keeps core's bar high but makes some features slower to build.
- Modules are compile-time units, not installable plugins, and there is no public SDK.
- Adding a module means touching shared files (the manifest, the API's boot wiring), which became hotspots.
