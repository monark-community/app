# @monark/projects

Extended module ; the projects catalog and the shared industry taxonomy that classifies it. Projects are org-scoped ; industries are a platform-wide shared taxonomy that any org's projects reference.

## What's here

- **`/contracts`** — zod input schemas (`createProjectInput`, `updateProjectInput`, `createIndustryInput`, `updateIndustryInput`), the `ProjectsEvents` domain-event union, and shared row types.
- **`/server`** — the `projectsRouter` tRPC surface, the Prisma data layer (`data.ts`), permission registration, and event-type registration.
- **`/client`** — presentational helpers for the projects / industries screens (the list + detail UI lives in `services/web`).

## Key concepts

- **Soft-delete + restore + hard-delete.** Both projects and industries carry a `deletedAt` column ; the default delete is a soft-delete (surfaced in the UI as **Archive**), `restore` clears it, and `{ hard: true }` removes the row. List queries hide soft-deleted rows unless `includeDeleted` is passed.
- **Cursor pagination.** `listProjects` and `listIndustries` follow the shared `@monark/common/pagination` convention : they take `{ limit?, cursor? }`, return `{ items, nextCursor, total }` (the `total` is a `count()` on the same filter), and order on a stable `id`-terminated keyset. Both accept a `search` filter server-side. Callers that need every row (a filter dropdown) request a high `limit`.
- **Auto-slugging.** `create` derives a slug from the title via `slugify` when the operator doesn't pin one ; `findFreeProjectSlug` appends `-2`, `-3`, … on collision so two similarly-titled projects in the same org both succeed. `update` resolves slug collisions the same way.
- **Two permission scopes.** Project permissions are **org-scoped** (a Curator role can be limited to one org's projects) ; industry permissions are **platform-scoped** because the taxonomy is shared across orgs.
- **Org isolation.** Every project read/write resolves `requireOrg`, gates on the relevant permission scoped to the org, and verifies `existing.organizationId === org.id` before mutating — the reference pattern other modules should follow.

## Public API (`@monark/projects/server`)

| Export                                                                 | Purpose                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `projectsRouter`                                                       | tRPC router (mounted at `projects.*`)                                    |
| `registerProjectsPermissions()`                                        | registers the `projects.*` / `industries.*` permissions at boot          |
| `registerProjectsEventTypes()`                                         | registers the operator-facing event descriptions for the webhooks picker |
| `slugify`, `findFreeProjectSlug`, `findFreeIndustrySlug`               | slug helpers (also used by the create-form preview)                      |
| data-layer fns (`listProjects`, `findProjectById`, `createProject`, …) | direct Prisma access for tests + server callers                          |

## Data model

Under the `// ── MODULE: projects ──` banner in [schema.prisma](../db/prisma/schema.prisma) : `Project`, `Industry`, `ProjectContributor` (+ the project↔industry relation). Migration : `20260529190000_add_projects`.

## Permissions

- `projects.read` / `projects.write` / `projects.delete` — org-scoped.
- `industries.read` / `industries.write` / `industries.delete` — platform-scoped (shared taxonomy).

Built-in `ADMIN` / `SYSADMIN` are auto-granted all of these via `hasPermission`'s short-circuit ; no backfill needed.

## Events emitted

`project.created`, `project.updated`, `project.deleted`, `industry.created`, `industry.updated`, `industry.deleted` (see [contracts/events.ts](src/contracts/events.ts)). Each carries the `actorId` and (for projects) the `organizationId` ; `*.updated` carries a `changed` field so subscribers can skip work. Consumed by : the webhooks outbox (any registered event is subscribable).

## tRPC surface

- `projects.list` (paginated : `{ …filters, limit?, cursor? }` → `{ items, nextCursor, total }`) / `getById` / `getBySlug` / `create` / `update` / `delete` / `restore`
- `projects.industries.list` (paginated, with `search`) / `getById` / `create` / `update` / `delete` / `restore`
