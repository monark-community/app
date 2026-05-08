# Student Teams (`@monark/teams`)

## Context

Student teams are the operational unit of Monark's incubation program. Each team consists of 3–6 students from a partner university, working on a specific project for one semester (4 or 8 months). Today the full picture of a team (who's in it, which project they're on, when they started, their submission deadlines) is split across the Student Teams database, the Courses database, and Notion meeting notes.

`@monark/teams` centralises team and university program data. Admins can see every active team, their projects, their schedules, and their upcoming deadlines without opening multiple Notion pages.

## Goals

- Full CRUD on student teams with university, course, and project linkage.
- University and course management (semester dates, submission deadlines, contact persons).
- Deadline tracking with reminder dates per university/semester.
- Domain events on team creation, project assignment, and completion.
- Clean integration with `@monark/projects` via events (no direct module import).

## Non-goals

- No student-facing portal. Students interact via Discord and email; the app is admin-only.
- No time-tracking or progress metrics. Meeting notes stay in Notion.
- No file uploads for project submissions. Submission logistics remain via email.
- No automated email to students or supervisors at Phase 1.5.

## User stories

- **As an admin**, I can view all student teams with their university, project, and status.
- **As an admin**, I can create a new team and assign it to a project.
- **As an admin**, I can track the team's kick-off date, sprint schedule, and semester.
- **As an admin**, I can manage universities and their associated courses and deadlines.
- **As an admin**, I can see all upcoming project submission deadlines across universities.
- **As the projects module**, I receive a `team.assigned` event when a team is linked to a project.

## Data model

See [crm-data-model.md](crm-data-model.md) for the full Prisma schema. Key models: `University`, `Course`, `StudentTeam`, `UniversityDeadline`, `ProjectTeam`.

## API surface

```ts
// @monark/teams/server

// Teams
teams.list({ status?, universityId?, courseId? })
teams.getById({ id })
teams.create({ officialName, githubTeamSlug?, status, universityId?, courseId?, kickOffAt?, ... })
teams.update({ id, ...partialFields })
teams.assignProject({ teamId, projectId })
teams.unassignProject({ teamId, projectId })
teams.complete({ teamId })  // sets status = "Completed"

// Universities
teams.listUniversities()
teams.createUniversity({ name })
teams.updateUniversity({ id, name })

// Courses
teams.listCourses({ universityId? })
teams.createCourse({ name, universityId, programType?, projectLengthMonths?, ... })
teams.updateCourse({ id, ...partialFields })

// Deadlines
teams.listDeadlines({ universityId?, semester? })
teams.createDeadline({ name, universityId?, courseId?, semester, reminder1At?, reminder2At? })
teams.updateDeadline({ id, ...partialFields })
teams.deleteDeadline({ id })
```

## UI flows

### Team list (`/admin/teams`)

- Status filter: All / Active / Completed
- University filter
- Semester filter (Fall / Winter / Summer + year)
- Each row: team name, project name, university, semester, status badge, kick-off date
- Click → team detail

### Team detail (`/admin/teams/:id`)

- Header: team name, status badge, GitHub team slug
- Project card: assigned project name + status badge; link to project detail
- University + Course card: university name, course name, program type, project length
- Timeline: kick-off date, sprint start, sprint schedule, semester
- Members: team lead name/email, university supervisor, student names (list of strings)
- Deadlines: inherited from course/university; shows upcoming reminders
- Edit button → inline edit form

### University management (`/admin/universities`)

- List of universities with course count and active team count
- Each university → courses + deadlines inline-expandable

### Upcoming deadlines (`/admin/universities/deadlines`)

- Calendar or list view showing all upcoming `UniversityDeadline` rows sorted by date
- Filter by university and semester
- Reminder dates shown with visual proximity indicator (overdue / today / this week / upcoming)

## Integration points

### Projects module (via events)

`@monark/teams` does not import from `@monark/projects`. Communication is one-directional via domain events:

- `teams.assignProject` emits `team.assigned` with `{ teamId, projectId, projectName, teamName }`
- `@monark/projects` has no subscriber; the event is for Phase 2 marketing only
- `@monark/projects` emits `project.statusChanged` which `@monark/teams` may eventually subscribe to for display, but this is deferred to avoid extended↔extended coupling

The `ProjectTeam` join table is written by the teams module when a project is assigned; the project module reads it via a core read interface.

### Webhooks

- `team.created`
- `team.assigned` — projectId, teamId, team + project names; Phase 2 marketing uses this for "New Student Teams" announcement posts
- `team.completed` — emits when team status → Completed; Phase 2 drafts "Project Finalized" post

## Implementation notes

- Scaffold: `pnpm gen:module teams --tier extended`
- Student names and team-lead info are stored as strings (no Monark App accounts for students)
- GitHub team slug is optional but useful for admins to find the corresponding GitHub team
- `UniversityDeadline.reminder1At` and `reminder2At` are exposed in the deadline list for reference; automated reminder notifications are a Phase 2+ feature
- Universities are light entities (name + id); if university management grows significantly, consider promoting to core
