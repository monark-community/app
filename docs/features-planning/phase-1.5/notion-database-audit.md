# Notion Database Audit

This document classifies every Notion database in the Monark workspace by extraction priority. "Extract" means data moves to the Monark App and Notion becomes read-only. "Keep" means the database stays in Notion (no equivalent feature planned). "Defer" means extraction is planned but not in Phase 1.5.

## Extract (Phase 1.5)

### Projects (39 rows)

The most data-rich entity. Owned by the CEO; used daily for program decisions.

| Notion field | Type | Notes |
|---|---|---|
| Name | string | Project display name (e.g. "WillChain") |
| ID | string | URL slug (e.g. "digital-will"); matches GitHub repo name |
| Status | select | Idea / In Progress / Completed / Archived |
| Adoption Score | number | 0–10 |
| Blockchain Score | number | 0–10 |
| Complexity Score | number | 0–10 |
| Effort Score | number | 0–10 |
| Revenue Score | number | 0–10 |
| Score | formula | Computed composite from above; extracted as stored value |
| Keywords | multi-select | Topic tags |
| Industries | relation | → Industries database |
| Confirmed Partners | relation | → Contacts / Partners |
| Potential Partners | relation | → Contacts / Partners |
| Student Teams | relation | → Student Teams database |
| Monark Website Link | formula | Read-only; regenerated in app from project ID |
| Mockup | formula | URL; regenerated in app |

**Extraction notes:** Composite score formula is preserved as a stored field and re-derived in the app from the five component scores. Relations are replaced with foreign-key joins to the extracted entities.

---

### Student Teams (10 rows)

Operational data for active and past student cohorts. Used by admins to track team progress.

| Notion field | Type | Notes |
|---|---|---|
| Official Team Name | string | Human-readable name |
| Project Teams | string | GitHub team identifier (e.g. "GitHub-Cura-F2025-1") |
| Status | select | Active / Completed / etc. |
| University | relation | → Courses (university context) |
| Project | relation | → Projects |
| Team Lead | person | Monark contact; extracted as name + email string |
| Students | person | Student member list; extracted as string array (no Monark accounts) |
| University Supervisor | text | Professor name |
| Year Started | number | Academic year |
| Semester Started | select | Fall / Winter / Summer |
| Sprint Start Date | date | |
| Sprint Day/time | text | e.g. "Thursdays 10 AM" |
| Kick Off | date | |
| Meeting Notes | relation | → Student Meeting Notes (kept in Notion) |
| Course's Information | relation | → Courses database |
| Notes | text | Free-form notes |
| Formula for Name | formula | Auto-generated; not extracted |

**Extraction notes:** Student and team-lead person fields are Notion-specific. In the app these become simple string fields (name + email) since students don't have Monark App accounts.

---

### Courses / Course Information (48 rows)

University program details: submission deadlines, contact persons, program structure. Essential for managing student relationships.

| Notion field | Type | Notes |
|---|---|---|
| Course's Name | string | e.g. "Polytechnique End-of-Degree" |
| University | relation | → Universities (derived from this DB) |
| Program Type | select | End-of-Degree / Capstone / etc. |
| Project Length | text | e.g. "4 Months", "8 Months" |
| Starts | multi-select | Fall / Winter / Summer |
| Ends | multi-select | Fall / Winter |
| Students per Team | number | |
| Main Contact | text | Professor name / email |
| Important Notes | text | Free-form submission rules |
| Project Submission Form | text | Link or description |
| Deadline Project Submission | text | Description of deadline logic |
| Collaboration Status | rollup | Read-only rollup; not extracted |
| Date | date | |

**Extraction notes:** University is an implicit entity in this database (the "University" relation targets a database not in scope). Extract a separate `University` entity from the unique university values in this database. Courses map to universities via foreign key.

---

### Contacts — Ambassadors (1 row; but the schema matters)

Currently sparse, but the schema defines the contact model for Monark's ambassador network.

| Notion field | Type | Notes |
|---|---|---|
| Name | string | |
| Email | email | |
| Phone | phone | |
| Telegram | text | Handle |
| Discord ID | text | |
| Country | text | |
| Province | text | |
| City | text | |
| Language Spoken | multi-select | |
| Type | multi-select | e.g. "Ambassador" |
| Supervisor | person | Internal Monark contact |

**Extraction notes:** Merged into the unified `@monark/contacts` module with `contactType: "ambassador"`. Future growth expected; schema is more important than current row count.

---

### Team Directory (3 rows)

Internal Monark team members. Used for org chart and contact lookups.

| Notion field | Type | Notes |
|---|---|---|
| Name | string | |
| Titre | text | Job title |
| E-mail | email | |
| Téléphone | phone | |
| LinkedIn | url | |
| Équipe | text | Team / department |
| Ancienneté | text | Seniority |
| Localisation | text | City / remote |
| Date d'arrivée | date | Start date |

**Extraction notes:** Merged into `@monark/contacts` with `contactType: "team-member"`. Bilingual field names (French) normalised in extraction.

---

### Industries (23 rows)

A reference table used to tag projects. Simple name → ID lookup.

| Notion field | Type | Notes |
|---|---|---|
| Name | string | e.g. "Healthcare", "Finance", "Gaming" |

**Extraction notes:** Extracted as an `Industry` lookup table. No UI needed; managed by admins as part of the project editor.

---

### Deadlines (20 rows)

University submission deadlines per semester. Operational for program managers.

| Notion field | Type | Notes |
|---|---|---|
| Name | string | Description of deadline |
| University | relation | → University entity |
| Semester | select | Fall / Winter / Summer |
| Tags | multi-select | |
| Reminder 1 | date | |
| Reminder 2 | date | |

**Extraction notes:** Attached to `University` and `Course` entities in the app. Replaces manual Notion date tracking.

---

## Defer (Post Phase 1.5)

### Marketing Campaigns (3 rows)

Lightweight UTM campaign tracker. Useful but not critical; Phase 2 marketing module will own this more completely.

### Articles (14 rows)

Blog/content article tracking. No Phase 1.5 feature planned; relevant to the Phase 2 content calendar.

### Social Media — Posting Schedule (0 rows)

Empty. Owned by Phase 2 marketing automation.

---

## Keep (Stays in Notion)

### Tasks (298 rows)

Sprint and task management. The Monark App is not a project management tool. Notion is the right home for this.

### Sprints (26 rows)

Sprint cadence data tied to the task system. Stays in Notion.

### Meeting Notes — General (25 rows)

Freeform meeting notes. Notion is better suited for rich text documents. Keep.

### Meeting Notes — Student (68 rows)

Per-team meeting notes. Stays in Notion; student teams reference these but the notes themselves are documents.

### Newsletter Ambassador / Newsletter General

Email newsletter content and recipient lists. Managed separately; not a CRM concern at this phase.
