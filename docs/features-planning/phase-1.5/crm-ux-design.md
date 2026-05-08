# CRM UX Design

## Context

The CRM is the first feature where Phase 1.5 diverges from standard app patterns. Auth, users, RBAC — those are infrastructure. The CRM is the first surface admins will open every day. Getting it right means Notion actually gets replaced; getting it wrong means people keep the Notion tab open "just in case."

This document defines the design principles and navigation architecture for the CRM before implementation begins. It is the entry point for Phase 1.5 work.

## Design principles

### 1. Information density over whitespace

Monark admins are power users, not casual browsers. The CRM should feel closer to Linear or Notion than to a marketing landing page. Tables over cards where possible; compact row heights; metadata visible without hovering.

### 2. One click to anything related

From a project, one click to any assigned team. One click from that team to the university. One click to any partner contact. The relational graph should feel navigable, not buried in edit forms.

### 3. Write from anywhere

Inline editing wherever possible. Status badges that toggle on click. Score sliders that save on blur. Avoid edit → save → back flows for routine field changes.

### 4. Consistency with the app shell

The CRM lives inside the existing admin section. It uses the same `PageLayout` (sidebar + content), the same `Sidebar` component, the same `RoleChip` for status badges, the same `TrustedDeviceCard` patterns for entity cards. No new design language; only new content.

### 5. Empty states are honest

"No teams assigned" should say so clearly with an action button. Not a spinner, not silence.

## Navigation architecture

The CRM adds a new section to the admin sidebar, parallel to existing admin tabs:

```
/admin
├── Organizations     (existing)
├── Users             (existing)
├── Roles & perms     (existing)
├── Webhooks          (existing)
└── CRM               (Phase 1.5)
    ├── Projects       /admin/crm/projects
    ├── Teams          /admin/crm/teams
    ├── Contacts       /admin/crm/contacts
    ├── Universities   /admin/crm/universities
    └── Apps           /admin/apps  (flat; not nested in CRM)
```

`/admin/crm` redirects to `/admin/crm/projects` (most-visited surface).

The CRM sidebar (within the CRM section) is a secondary in-content navigation strip rendered by each CRM page via `PageLayout`'s `sidebar` slot.

## Key interaction patterns

### Project list — the hub

The project list is the most important screen. Design targets:

- Table with sticky header, alternating row shading
- Columns: Name, Status (badge), Score (number + mini-bar), Industries (tags), Teams (count), Partners (count), Last updated
- Default sort: Score descending
- Inline status change: click the status badge → dropdown with other statuses
- Row click: navigate to project detail
- Bulk actions (deferred): select multiple rows → bulk status change

### Entity cards

Used across the CRM for referenced entities (team cards on a project page, contact cards on a team page). Pattern:

```
┌──────────────────────────────────┐
│ [Icon]  Entity name              │
│         Subtitle (type / role)   │
│         Metadata line            │
└──────────────────────────────────┘
```

Consistent with `TrustedDeviceCard` from the UI registry. Remove button on the right edge when the relation can be dissolved.

### Relation pickers (modals)

When linking an entity to another (assigning a team to a project, adding a partner to a project), a modal search picker opens:

- Text input auto-filters as you type
- Results show name + key metadata
- Click to select, confirm button adds the relation
- Recently linked items shown first

### Score editor

Project scoring is a dedicated card on the project detail page:

```
┌──────────────────────────────────────────┐
│ Composite Score:  327 / 1000             │
│ ─────────────────────────────────────── │
│ Adoption     [──────●───────] 6          │
│ Blockchain   [────────●─────] 8          │
│ Complexity   [──●───────────] 2          │
│ Effort       [───────●──────] 7          │
│ Revenue      [─────●────────] 5          │
└──────────────────────────────────────────┘
```

Sliders save on mouseup/touchend. Composite score updates in real time as sliders move. Requires `projects:score` permission; without it, all sliders are read-only.

## Admin vs Moderator vs Developer views

| Surface | Admin | Moderator | Developer |
|---|---|---|---|
| Project list | Full + edit controls | Full + edit (no scores) | Read-only |
| Project detail | Full edit | Edit name/status/teams | Read-only |
| Score editor | Editable | Hidden | Hidden |
| Contact directory | Full CRUD | Full read | Hidden |
| Team list | Full CRUD | Full read + edit | Hidden |
| University list | Full CRUD | Read | Hidden |
| Apps management | Full CRUD | Hidden | Hidden |

## URL structure

```
/admin/crm/projects              List
/admin/crm/projects/new          Create form
/admin/crm/projects/:id          Detail
/admin/crm/projects/:id/edit     Edit form (fallback for non-inline edits)

/admin/crm/teams                 List
/admin/crm/teams/new             Create form
/admin/crm/teams/:id             Detail

/admin/crm/contacts              List (tabbed by type)
/admin/crm/contacts/new          Create form
/admin/crm/contacts/:id          Detail

/admin/crm/universities          List
/admin/crm/universities/:id      Detail (courses + deadlines)
/admin/crm/universities/deadlines  Calendar/list view of all upcoming deadlines

/admin/apps                      Apps Hub management
```

## Phase 1.5 design deliverables

Before implementation begins, produce:

1. **Figma screens** (Dominic) for:
   - Project list with filters and sort controls
   - Project detail with scoring card, teams section, partners section
   - Contact directory (tabbed list)
   - Team detail with timeline and members

2. **Component inventory** — confirm which components come from `@monark/ui`, which come from `@monark/components`, and which are new to the CRM.

3. **RBAC matrix review** — confirm the admin/moderator/developer permission matrix with Dominic before implementing guards.

These deliverables gate Step 2 (Project Directory implementation) in the [phase-planning.md](phase-planning.md) order.
