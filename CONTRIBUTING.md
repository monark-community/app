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
- Prefer clear identifiers and minimal comments; add a comment only when the *why* is non-obvious.
- This repo is a pnpm monorepo orchestrated by Turbo. Requires **Node 22** (see `.nvmrc`) and **pnpm 10**.

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

## 3. Reporting Issues

- Use the **Issues** tab to report bugs or request features.
- Include steps to reproduce, expected behavior, and screenshots if applicable.

---

## 4. Legal Considerations

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

## 5. Code of Conduct

We expect all contributors to follow a respectful and collaborative approach. Please see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for details.

---

Thank you for helping improve **Monark App**! Your contributions are highly appreciated.

