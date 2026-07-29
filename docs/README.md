# Monark App Documentation

Internal documentation for the Monark App monorepo.

- [user-guide/](user-guide/) ; what the app does, written for the people using it. Covers signing in, your account, navigating the chrome, and everything under `/admin`. No code, no scripts.
- [features-planning/](features-planning/) ; per-feature implementation specifications grouped by phase (0–3). Phases 0 and 1 are shipped ; their docs are retained as historical specs. Phases 2–3 remain active planning.
- [technical-documentation/](technical-documentation/) ; developer reference including [architecture](technical-documentation/architecture.md) (module system, event bus, boundaries), [project structure](technical-documentation/project-structure.md) (directory layout, tooling, scripts), getting-started guides, account-recovery runbook, the [test plan](technical-documentation/test-plan.md), [webhook secret resolver](technical-documentation/webhook-secret-resolver.md), the [Kanban module](technical-documentation/kanban.md), the [Automation module](technical-documentation/automation.md), the [secrets store](technical-documentation/secrets.md), the [Files module](technical-documentation/files.md), and other internal-tooling notes.
- [todo/backlog.md](todo/backlog.md) ; open follow-up items, dated. The CHANGELOG carries the history.

Add any new design notes, ADRs, or runbooks here. Keep each topic in its own file ; cross-link liberally.
