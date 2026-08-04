# Phase 1.5 — Implementation order

## Goal

Replace Notion as the operational system of record for Monark's core data. Ship a purpose-built CRM inside the Monark App so admins can manage projects, student teams, contacts, universities, and industries without leaving the platform. Phase 1.5 is complete when every Notion database identified for extraction has a live equivalent in the app and the Notion copies are demoted to read-only archives.

## Why 1.5 and not 2

Phase 2 was originally planned as user acquisition (onboarding, referrals). Given Monark's current direction — downsizing, CEO prioritising AI automation, fewer active student cohorts — controlling and centralising operational data is more critical than growing the user base. Phase 1.5 inserts itself between Phase 1 (core platform) and Phase 2 (marketing automation), which itself depends on CRM data as its event source.

## Order

### Step 1 — CRM data model + migration plan

> Spec: [crm-data-model.md](crm-data-model.md)

Design the Prisma schemas for every entity extracted from Notion. Run the one-time migration script to seed production data. No UI yet; exit criterion is data in the database matching Notion.

Concrete tasks:
1. Audit every Notion database (see [notion-database-audit.md](notion-database-audit.md)).
2. Author Prisma models and migrations.
3. Write and run the seeder script (`tools/seed-from-notion.ts`).
4. Verify row counts and spot-check data quality.
5. Deprecate Notion write access for migrated entities (read-only archive).

### Step 2 — Project Directory module (`@monark/projects`)

> Spec: [project-directory.md](project-directory.md)

The largest entity. 39 projects with composite scoring, status tracking, industry tags, and student team assignments. Admin CRUD first, then public read views.

### Step 3 — Contacts + Partners module (`@monark/contacts`)

> Spec: [contacts-partners.md](contacts-partners.md)

Partners, ambassadors, universities, and the Monark team directory. All contact types unified under one module with type-safe polymorphic records.

### Step 4 — Student Teams module (`@monark/teams`)

> Spec: [student-teams.md](student-teams.md)

Team composition, project assignment, semester scoping, and deadline tracking. Interfaces with `@monark/projects` via events.

### Step 5 — Apps Hub

> Spec: [apps-hub.md](apps-hub.md)

The "Apps" menu already scaffolded in Dominic's local branch. RBAC-gated service directory; admin-manageable. Ships last because it has no data migration dependency.

## Exit criteria

- Every Notion database listed in [notion-database-audit.md](notion-database-audit.md) as "extract" is live in the app with complete data.
- Admin users can perform full CRUD on all CRM entities without touching Notion.
- Webhooks fire `project.statusChanged`, `partner.added`, `team.assigned`, and equivalent events so Phase 2 marketing automation can subscribe.
- The Notion databases are archived (read-only); the app is the system of record.

## Dependency map

```
phase-1 (auth, users, orgs, rbac, feature-flags, notifications, webhooks)
   │
   ▼
phase-1.5 (CRM)
   ├── @monark/projects    ← extended; depends on core only
   ├── @monark/contacts    ← extended; depends on core only
   ├── @monark/teams       ← extended; depends on projects (events), core
   └── apps-hub            ← no module; wired into existing web service config
   │
   ▼
phase-2 (marketing automation, referral)
   └── @monark/marketing   ← subscribes to CRM domain events via webhook bus
```

## What Phase 1.5 deliberately does not do

- **No public-facing project pages.** The monark.io website shows project cards; the app's project directory is internal/admin only at this phase.
- **No student-facing views.** Students still interact through Discord and email. The app serves admins and moderators at Phase 1.5.
- **No live Notion sync.** The migration is one-time. Notion becomes read-only; the app owns the data.
- **No onboarding flows.** User onboarding is Phase 3.
