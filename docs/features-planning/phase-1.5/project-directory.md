# Project Directory (`@monark/projects`)

## Context

Projects are the centrepiece of Monark's ecosystem. The CEO manages 39+ projects with composite scoring, status tracking, industry tagging, partner relations, and student team assignments. Today this lives in Notion with a formula-driven score column; admins open Notion to check project status, assign teams, or update scores.

The Project Directory moves this entirely into the app. It becomes the authoritative source of truth that downstream systems (the website, the marketing automation, Webhooks) read from. When a project's status changes in the app, a domain event fires; the marketing module can pick it up and draft a social post.

## Goals

- Full CRUD on projects, industries, partner relations, and team assignments.
- Composite scoring (five component scores → one derived score) with admin-editable fields.
- Filtered/sorted project list with search, status filter, industry filter, and score sort.
- Project detail view showing all metadata, assigned teams, partner contacts, and event history.
- Domain events on every state change so Phase 2 marketing automation can subscribe.
- Public-read-only view visible to non-admin users (Developer, Student, Ambassador roles).

## Non-goals

- No public website integration at Phase 1.5. The monark.io website is separate; sync is a future task.
- No mockup image management. Mockup URLs are stored as strings; no upload flow.
- No project proposal submission form. Students submit via email; the admin creates the record manually.
- No voting or community ranking of projects. Phase 3 concern.

## User stories

- **As an admin**, I can view all projects in a sortable, filterable list.
- **As an admin**, I can create a new project with all scoring fields, status, industry tags, and partner links.
- **As an admin**, I can update a project's status (Idea → In Progress → Completed).
- **As an admin**, I can assign a student team to a project.
- **As an admin**, I can link confirmed and potential partner contacts to a project.
- **As a moderator**, I can view and edit projects but cannot change scoring fields.
- **As a developer / student**, I can browse the project directory (read-only).
- **As the marketing module**, I receive domain events when a project's status changes.

## Data model

See [crm-data-model.md](crm-data-model.md) for the full Prisma schema. Key models: `Project`, `Industry`, `ProjectIndustry`, `ProjectPartner`, `ProjectTeam`.

## API surface

```ts
// @monark/projects/server

// List + search
projects.list({ status?, industryId?, search?, sortBy?: "score" | "name" | "updatedAt" })
projects.getById({ id })

// CRUD
projects.create({ name, slug, status, scores, keywords, industryIds, partnerIds })
projects.update({ id, ...partialFields })
projects.archive({ id })  // sets status = ARCHIVED

// Relations
projects.assignTeam({ projectId, teamId })
projects.unassignTeam({ projectId, teamId })
projects.addPartner({ projectId, contactId, role: "confirmed" | "potential" })
projects.removePartner({ projectId, contactId, role })

// Industries (managed separately but scoped here)
projects.listIndustries()
projects.createIndustry({ name })
projects.deleteIndustry({ id })  // only if no projects reference it
```

## UI flows

### Project list (`/admin/projects`)

- Searchable by name, slug, or keyword
- Status filter chips (All / Idea / In Progress / Completed / Archived)
- Industry filter (multi-select dropdown)
- Sort by Score (desc default), Name (A-Z), Last Updated
- Each row: project name, status badge, composite score, industry tags, assigned team count, partner count

### Project detail (`/admin/projects/:id`)

- Header: name, slug, status badge (editable inline), composite score
- Scoring card: five sliders / number inputs (Adoption, Blockchain, Complexity, Effort, Revenue) + live-updating composite score; requires `projects:score` permission
- Industries: editable tag list
- Partners: two sections (Confirmed / Potential), each a list of Contact cards with remove button; add button opens contact picker modal
- Teams: list of assigned student teams with link to team detail; add button opens team picker
- Activity feed: recent domain events (status changed, team assigned, partner added)

### Project create / edit (`/admin/projects/new`, `/admin/projects/:id/edit`)

- Name (required), slug (auto-derived from name, editable)
- Status select
- Keywords (multi-input tag field)
- Industry multi-select (from Industries list)
- Score fields (optional at creation; editable later)

## Integration points

### Webhooks

Every project mutation emits a domain event. Webhook subscribers on `project.*` receive:
- `project.created` — new project, full payload
- `project.statusChanged` — previous + new status, project metadata
- `project.updated` — changed fields diff
- `project.archived` — same as statusChanged with status: ARCHIVED
- `project.teamAssigned` — projectId, teamId, team name
- `project.partnerAdded` — projectId, contactId, role

### Phase 2 marketing automation

`@monark/marketing` subscribes to `project.statusChanged` via the webhook bus. When a project moves to "In Progress" or "Completed", the module drafts a social post using the matching Notion template:
- In Progress → "Project Update" template
- Completed → "Project Finalized" template

The event payload includes project name, slug, team name, and partner names so the template engine can resolve variables without a secondary lookup.

## Implementation notes

- Scaffold: `pnpm gen:module projects --tier extended`
- Composite score computation: see `packages/projects/src/server/scoring.ts` spec in [crm-data-model.md](crm-data-model.md)
- Slug uniqueness: enforced at DB level (`@unique`) and validated in the create/update procedure
- Soft archive: `status = ARCHIVED` is the delete equivalent; no hard delete until Phase 2 cleanup tooling exists
- Industry CRUD lives inside this module (not a separate module) since Industries exist solely to tag projects
