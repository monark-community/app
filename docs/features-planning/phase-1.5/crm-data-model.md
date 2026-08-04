# CRM Data Model

## Context

Phase 1.5 replaces seven Notion databases with Prisma-backed entities in the Monark App. This document defines the authoritative data model for all extracted entities, their relations, and the migration strategy.

The Notion databases being replaced are: Projects, Student Teams, Courses, Contacts (Ambassadors + Team Directory), Industries, and Deadlines. See [notion-database-audit.md](notion-database-audit.md) for the full classification.

## Goals

- One Prisma schema per extracted entity, backed by Supabase Postgres.
- Full fidelity with existing Notion data; no field dropped silently.
- Relations expressed as foreign keys; Notion relation arrays become join tables.
- Domain events emitted for every state change so Phase 2 marketing automation can subscribe.
- One-time seeder script that reads from the Notion API and writes to Postgres.

## Non-goals

- No live Notion sync. Migration is one-time; Notion becomes read-only.
- No student-facing UI at Phase 1.5. Admin and moderator access only.
- No file attachment migration. Mockup/image links are preserved as URLs.

## Prisma schema

### Industry

```prisma
model Industry {
  id        String   @id @default(cuid())
  name      String   @unique
  notionId  String?  @unique  // Notion page ID; retained for migration traceability

  projects  ProjectIndustry[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### University

Derived from the Courses database; not a standalone Notion database.

```prisma
model University {
  id        String   @id @default(cuid())
  name      String   @unique
  notionId  String?  @unique

  courses   Course[]
  teams     StudentTeam[]
  deadlines UniversityDeadline[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Course

Maps to the Notion "Courses / Course Information" database.

```prisma
model Course {
  id                     String   @id @default(cuid())
  notionId               String?  @unique

  name                   String
  universityId           String
  university             University @relation(fields: [universityId], references: [id])

  programType            String?   // "End-of-Degree", "Capstone", etc.
  projectLengthMonths    Int?
  semesters              String[]  // ["Fall", "Winter"]
  studentsPerTeam        Int?
  mainContact            String?   // name + email, freeform
  importantNotes         String?
  projectSubmissionForm  String?
  deadlineDescription    String?

  teams     StudentTeam[]
  deadlines UniversityDeadline[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### UniversityDeadline

```prisma
model UniversityDeadline {
  id           String   @id @default(cuid())
  notionId     String?  @unique

  name         String
  semester     String    // "Fall" | "Winter" | "Summer"
  tags         String[]
  reminder1At  DateTime?
  reminder2At  DateTime?

  universityId String?
  university   University? @relation(fields: [universityId], references: [id])
  courseId     String?
  course       Course?     @relation(fields: [courseId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Contact

Unified contact table covering ambassadors, partners, team members, and universities.

```prisma
enum ContactType {
  AMBASSADOR
  PARTNER
  UNIVERSITY_CONTACT
  TEAM_MEMBER
  OTHER
}

model Contact {
  id          String      @id @default(cuid())
  notionId    String?     @unique

  name        String
  type        ContactType

  email       String?
  phone       String?
  telegram    String?
  discordId   String?
  linkedIn    String?

  // Location
  country     String?
  province    String?
  city        String?

  // Languages
  languages   String[]

  // Internal
  title       String?     // job title (team-member context)
  team        String?     // department / squad
  seniority   String?
  startedAt   DateTime?   // date d'arrivée
  location    String?     // city / remote

  // Relationships
  projectsAsPartner   ProjectPartner[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type])
  @@index([email])
}
```

### Project

```prisma
enum ProjectStatus {
  IDEA
  IN_PROGRESS
  COMPLETED
  ARCHIVED
}

model Project {
  id        String   @id @default(cuid())
  notionId  String?  @unique

  name      String
  slug      String   @unique    // matches GitHub repo name (e.g. "digital-will")
  status    ProjectStatus @default(IDEA)

  // Scoring (0-10 each; null = unscored)
  adoptionScore    Int?
  blockchainScore  Int?
  complexityScore  Int?
  effortScore      Int?
  revenueScore     Int?

  // Keywords / tags
  keywords  String[]

  // Derived URLs (computed from slug, not stored by Notion formula)
  // These are computed properties, not DB columns.
  // monarkWebsiteUrl = https://monark.io/projects/<slug>
  // mockupUrl = https://mock.monark.io/<slug>

  // Relations
  industries ProjectIndustry[]
  teams      ProjectTeam[]
  partners   ProjectPartner[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([slug])
}

// Composite score computed at query time from component scores.
// Formula: sum of non-null scores × their weights.
// Weights (matching Notion formula): adoption×3, blockchain×2,
// complexity×1 (inverted), effort×1 (inverted), revenue×2.
// Stored separately so historical queries don't recompute.
model ProjectScoreSnapshot {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  score      Int
  recordedAt DateTime @default(now())

  @@index([projectId])
}
```

### Join tables

```prisma
model ProjectIndustry {
  projectId  String
  industryId String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  industry   Industry @relation(fields: [industryId], references: [id], onDelete: Cascade)

  @@id([projectId, industryId])
}

model ProjectPartner {
  projectId  String
  contactId  String
  role       String    // "confirmed" | "potential"
  project    Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  contact    Contact   @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@id([projectId, contactId, role])
}

model ProjectTeam {
  projectId String
  teamId    String
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  team      StudentTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@id([projectId, teamId])
}
```

### StudentTeam

```prisma
model StudentTeam {
  id              String   @id @default(cuid())
  notionId        String?  @unique

  officialName    String
  githubTeamSlug  String?  // e.g. "GitHub-Cura-F2025-1"
  status          String   // "Active" | "Completed"
  yearStarted     Int?
  semesterStarted String?  // "Fall" | "Winter" | "Summer"
  sprintStartDate DateTime?
  sprintSchedule  String?  // e.g. "Thursdays 10 AM"
  kickOffAt       DateTime?
  notes           String?
  universityId    String?
  university      University? @relation(fields: [universityId], references: [id])
  courseId        String?
  course          Course?     @relation(fields: [courseId], references: [id])

  // Team composition stored as strings (students don't have App accounts)
  teamLeadName    String?
  teamLeadEmail   String?
  universitySupervisor String?
  memberNames     String[]   // student names

  projects ProjectTeam[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([universityId])
}
```

## Composite score computation

The Notion "Score" formula is reconstructed as a server-side utility in `@monark/projects`:

```ts
// packages/projects/src/server/scoring.ts
export function computeProjectScore(project: {
  adoptionScore: number | null
  blockchainScore: number | null
  complexityScore: number | null
  effortScore: number | null
  revenueScore: number | null
}): number {
  const weights = {
    adoptionScore: 3,
    revenueScore: 2,
    blockchainScore: 2,
    effortScore: 1,    // higher effort = lower desirability; weight stays positive,
    complexityScore: 1 // inversion handled if needed in UI presentation
  }
  let total = 0
  let denominator = 0
  for (const [field, weight] of Object.entries(weights)) {
    const val = project[field as keyof typeof project]
    if (val !== null) {
      total += val * weight
      denominator += weight * 10 // max 10 per field
    }
  }
  return denominator === 0 ? 0 : Math.round((total / denominator) * 1000)
}
```

Score is stored on the `Project` row (denormalised for sorting/filtering) and recomputed whenever component scores change.

## Migration strategy

### Script: `tools/seed-from-notion.ts`

Reads from the Notion API snapshot (or live API) and writes to Supabase Postgres. Idempotent via `notionId` upserts.

```bash
pnpm tsx tools/seed-from-notion.ts \
  --notion-token $NOTION_TOKEN \
  --database-url $DATABASE_URL \
  [--dry-run]              # print what would be written, no DB writes
  [--from-snapshot path]   # use a local JSON snapshot instead of live API
```

**Order of operations:**
1. Industries (no dependencies)
2. Universities (derived from Course records)
3. Courses (depends on Universities)
4. Deadlines (depends on Universities + Courses)
5. Contacts (no dependencies)
6. Projects (depends on Industries, Contacts)
7. Student Teams (depends on Universities, Courses, Projects)

### Verification

After seeding:
```bash
pnpm tsx tools/verify-crm-migration.ts
# Compares row counts and spot-checks relations
# against a Notion snapshot
```

## Domain events

Every CRM write emits a domain event that the Phase 2 marketing module can subscribe to via webhooks or the event bus:

| Event | Trigger |
|---|---|
| `project.created` | New project row |
| `project.statusChanged` | `status` field updated |
| `project.updated` | Any other field change |
| `project.archived` | Status → ARCHIVED |
| `contact.created` | New contact |
| `contact.updated` | Any field change |
| `team.created` | New student team |
| `team.assigned` | Team linked to project |
| `team.completed` | Team status → Completed |

Event payloads include the entity ID, changed fields, actor ID, and `occurredAt`. The webhook bus in `@monark/webhooks` fans these out to registered endpoints automatically.

## RBAC permissions

New permissions registered at api boot by each CRM module:

| Permission slug | Description |
|---|---|
| `projects:read` | View project directory |
| `projects:write` | Create / edit / archive projects |
| `projects:score` | Edit scoring fields |
| `contacts:read` | View contacts directory |
| `contacts:write` | Create / edit / delete contacts |
| `teams:read` | View student teams |
| `teams:write` | Create / edit / assign teams |
| `courses:read` | View university programs |
| `courses:write` | Create / edit university programs |

Default role assignments:
- **Admin**: all CRM permissions
- **Moderator**: read on all; write on projects (except scoring) and teams
- **Developer / Student / Ambassador**: `projects:read` only (public project directory)
