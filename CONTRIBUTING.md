# Contributing to Monark App

Thank you for your interest in contributing to **Monark App**! We welcome contributions of all kinds: bug reports, feature requests, documentation improvements, and code.

By contributing, you agree to the following terms:

---

## 1. How to Contribute

1. **Fork the repository** and create your feature branch:

```bash
git checkout -b feature/my-feature
```

2. **Make your changes** following our [code style guidelines](#code-style).

3. **Commit your changes** with clear [conventional](https://www.conventionalcommits.org/en/v1.0.0) messages:

```bash
git commit -m "feat: add short descriptive message"
```

4. **Push your branch** to your fork:

```bash
git push origin feature/my-feature
```

5. **Open a pull request** against the `main` branch of this repository.

---

## 2. Code Style & Development Workflow

- Follow the existing project code style; Prettier and ESLint are configured at the repo root.
- Prefer clear identifiers and minimal comments; add a comment only when the _why_ is non-obvious.
- This repo is a pnpm monorepo orchestrated by Turbo. Requires **Node 22** (see `.nvmrc`) and **pnpm 10**.
- **TypeScript imports use no file extension on relative paths.** Write `import { x } from "./events"`, not `"./events.js"` or `"./events.ts"`. The base `tsconfig.json` uses `moduleResolution: "Bundler"` precisely so source works uniformly across Next (SWC), `tsx` (esbuild), and `tsc --noEmit`. NodeNext-style `.js` suffixes are the wrong call here and have broken Next bundling more than once.

Before opening a PR, run the same checks CI runs:

```bash
pnpm install              # installs workspace deps
pnpm gen                  # regenerate codegen outputs (events + routers)
pnpm typecheck            # tsc --noEmit across every package
pnpm lint                 # eslint across every package
pnpm test                 # vitest across every package
pnpm check:tiers          # enforce no extended-to-extended module deps
```

If you added or changed events or tRPC procedures inside a module, re-run `pnpm gen` and **commit the regenerated files**. CI fails on codegen drift.

To scaffold a new module package:

```bash
pnpm gen:module <name> --tier core|extended
```

See [docs/features-planning/](./docs/features-planning/) for the per-feature specifications that should inform larger changes.

---

## 3. Completing a Feature

When you're ready to close out a feature PR (or substantive change), two non-code artifacts must land in the same PR:

1. **Update (or create) the module README** at `packages/<name>/README.md`. It should reflect what actually shipped; not what the planning doc promised. See the shape below.
2. **Add a dated entry to `CHANGELOG.md`** under `[Unreleased]` in the format `- YYYY-MM-DD: <one-line summary>`. Prefer ≤ 160 characters. One entry per feature, foundation shift, or substantive fix.

Do **not** edit the planning doc under `docs/features-planning/` after the feature lands. Those docs are the historical record of the spec; consumers read them to understand the original intent, even when implementation diverged. Divergence goes in the module README, not retroactively into the planning doc.

### Module README shape

Each package in `packages/` ships with a README. Target 100–300 lines; prefer code examples over prose. Sections to cover:

- **Title + one-paragraph opener** describing what this module does and why it exists.
- **Spec pointer** linking to the planning doc under `docs/features-planning/...`.
- **What's here** — quick index of public exports by entry point (`/server`, `/client`, `/contracts`).
- **Key concepts** — mental models a consumer needs to use the module correctly (e.g. resolution order, quorum rules, scope cascade).
- **Usage** — minimal working examples for the 2–3 most common call sites.
- **Dependencies** — other workspace packages and external services the module reaches for.
- **Operational** — env vars, Prisma migrations, seed steps, any one-time setup required to actually run it.
- **Events emitted / consumed** — for inter-module observability.
- **Deferred** — known-missing pieces with a pointer to where they land (often "ships with `@monark/<other>`").

[packages/feature-flags/README.md](./packages/feature-flags/README.md) is a working example; copy its shape when you start a new module.

---

## 4. Reporting Issues

- Use the **Issues** tab to report bugs or request features.
- Include steps to reproduce, expected behavior, and screenshots if applicable.

---

## 5. Legal Considerations

- By contributing, you agree that your contributions will be licensed under the terms of the [LICENSE](./LICENSE).
- Your contributions become part of **16918140 Canada Inc. (Monark Inc.)**’s project.

> Example copyright notice for contributions:
>
> ```text
> Copyright [Year] [Contributor Name]
> Licensed under the Apache License, Version 2.0
> ```

- **Do not submit code you do not have the right to contribute**.

- **Note:** Including a copyright notice is only necessary for contributions that add significant value, such as core business logic, important decentralized features, or substantial code changes.

---

## 6. Code of Conduct

We expect all contributors to follow a respectful and collaborative approach. Please see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for details.

---

Thank you for helping improve **Monark App**! Your contributions are highly appreciated.
