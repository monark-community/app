# Monark App Documentation

Documentation for the Monark App monorepo. The published sections sync to the docs site ; write and place every page with the `monark-docs` skill ([.claude/skills/monark-docs](../.claude/skills/monark-docs/SKILL.md)), which owns the section map, page types, house style and the linter.

Published, organized by what the reader is trying to do:

- [get-started/](get-started/_index.md) ; one guided lesson per audience: first steps in the app, a development environment, a first deployment.
- [use/](use/_index.md) ; everyday tasks in the app, one page per task.
- [administer/](administer/_index.md) ; setting up an organization: people, roles, data models, integrations.
- [build/](build/_index.md) ; the public API, webhooks, agents and MCP, and extending Monark itself.
- [reference/](reference/_index.md) ; lookup tables: query syntax, events, flags, modules, scripts, environment variables.
- [concepts/](concepts/_index.md) ; how Monark works and why: platform overview, architecture, permissions, automations.
- [operate/](operate/_index.md) ; runbooks for deploying and running an instance.
- [decisions/](decisions/_index.md) ; architecture decision records, numbered in order of acceptance.

Extended modules keep their pages with the package, under the same section folders (`packages/<module>/docs/use/`, `concepts/`, `decisions/`), and the site merges them in.

Not published:

- [features-planning/](features-planning/) ; per-feature implementation specs. **Shipped** specs stay in the `phase-0`…`phase-3` folders as immutable historical records ; **[proposed/](features-planning/proposed/)** holds designed-but-unbuilt features. See the [folder README](features-planning/README.md).
- [agents/](agents/) ; conventions for agents (and humans) working in this repo: [i18n](agents/i18n.md), [schema changes](agents/schema-changes.md), [testing](agents/testing.md) and [module authoring](agents/module-authoring.md).
- [todo/backlog.md](todo/backlog.md) ; open follow-up items, dated. The CHANGELOG carries the history.
- [archive/](archive/) ; dated point-in-time records kept for history, not current state.
