# Contacts & Partners (`@monark/contacts`)

## Context

Monark has contacts scattered across three Notion databases: Contacts — Ambassadors (partner / ambassador / external contacts), Team Directory (internal Monark staff), and implicit university contacts embedded in the Courses database. Today there is no unified view; looking up a partner's email means knowing which Notion database to open.

`@monark/contacts` unifies all contact types under one module. It is the CRM address book; other modules reference contacts by ID. The Project Directory links partners via `ProjectPartner`; the Student Teams module references university supervisors and course contacts.

## Goals

- One contact record per person, regardless of type (ambassador, partner, team member, university contact).
- Type-safe contact types with type-specific field sets displayed in the UI.
- Searchable, filterable directory visible to admins and moderators.
- Contact records linkable to projects (as partners) and universities (as course contacts).
- Domain events on create/update so Phase 2 can draft partner announcement posts.

## Non-goals

- No email / messaging integration. This is a directory, not a CRM pipeline.
- No public-facing contact page. Internal tool only.
- No duplicate detection or merge UI at Phase 1.5. Admins manage quality manually.
- No import from external sources beyond the Notion migration.

## Contact types

| Type | Source | Key fields |
|---|---|---|
| `AMBASSADOR` | Contacts — Ambassadors | Telegram, Discord, country, languages |
| `PARTNER` | Implied from Project partner relations | Company affiliation (future), email |
| `UNIVERSITY_CONTACT` | Courses main contact field | University affiliation, role |
| `TEAM_MEMBER` | Team Directory | Title, team, seniority, LinkedIn, start date |
| `OTHER` | Catch-all | Base fields only |

## Data model

See [crm-data-model.md](crm-data-model.md) for the full Prisma schema. Key model: `Contact`, `ContactType` enum, `ProjectPartner` join.

## API surface

```ts
// @monark/contacts/server

contacts.list({ type?, search?, countryCode? })
contacts.getById({ id })

contacts.create({ name, type, email?, phone?, telegram?, ... })
contacts.update({ id, ...partialFields })
contacts.delete({ id })  // soft-delete; hard-delete blocked if referenced by projects

// Quick search for contact pickers (project partner modal, team supervisor field)
contacts.search({ query, limit?: 10 })
```

## UI flows

### Contact directory (`/admin/contacts`)

- Type filter tabs: All / Ambassadors / Partners / Team / Other
- Search bar (name, email)
- Country filter (ambassadors)
- Each row: avatar placeholder + name, type badge, email, primary location, linked projects count
- Click → contact detail

### Contact detail (`/admin/contacts/:id`)

- Base fields: name, type badge, email, phone, Telegram, Discord
- Location: country, province, city
- Type-specific section:
  - Ambassador: languages, supervisor link
  - Team member: title, team, seniority, LinkedIn, start date
  - University contact: university affiliation (linked), course links
- Linked projects: list of projects where this contact is a confirmed/potential partner
- Edit button → inline edit form

### Contact create / edit (`/admin/contacts/new`, `/admin/contacts/:id/edit`)

- Type selector at the top; form fields update based on type
- Shared fields: name, email, phone, country
- Type-specific fields rendered as a collapsible section below

## Integration points

### Projects module

`@monark/contacts` exports a `contactsReadInterface` from `/server`:

```ts
export const contactsReadInterface = {
  getById: (id: string) => ContactRow,
  search: (query: string) => ContactRow[],
  listByIds: (ids: string[]) => ContactRow[],
}
```

The Project Directory uses this interface to resolve partner contacts without a direct module import (no extended-to-extended coupling).

### Webhooks

- `contact.created` — new contact record
- `contact.updated` — changed fields diff (name, type, email)

These feed Phase 2's partner announcement templates. When `contact.created` with `type: PARTNER`, the marketing module can draft a "New Partner" post.

## Implementation notes

- Scaffold: `pnpm gen:module contacts --tier extended`
- Soft delete: `deletedAt` column; blocked if contact is referenced as a project partner
- Avatar: no photo upload at Phase 1.5; initials-based avatar in UI (same as existing user avatar fallback)
- University contacts are not a separate entity; they're `Contact` records with `type: UNIVERSITY_CONTACT` and an affiliation string. Full University entity lives in `@monark/teams`.
