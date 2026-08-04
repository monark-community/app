# User Onboarding

## Context

First impressions set retention. The starter brief distinguishes four roles with deliberately different onboarding styles:

- **Developers**: self-onboarding, decentralized, long-running relationship, high retention target
- **Students**: guided, time-boxed (4–8 months), conversion target is "become a Developer"
- **Ambassadors**: long-term community relationship, customized per program
- **Admins (Monark execs)**: internal; onboarding primarily about TOTP enrollment + navigation primer

Onboarding is where the product earns or loses a user. It also emits the first wave of signals the contribution-estimation module (Phase 3) consumes. Getting it right is load-bearing.

## Goals

- Role-driven onboarding flow: the role determines which steps appear and in what order.
- Each step is an independent server-rendered page. State is persisted; users can pause, leave, come back later.
- Progress is visible: a progress indicator, with skippable vs required steps clearly marked.
- The app blocks no-sensitive routes until onboarding is complete — but browsing is allowed.
- Onboarding completion emits a domain event; contribution-estimation and other extended modules consume it.
- Admins can preview onboarding flows as any role via a "preview mode" on an admin page.

## Non-goals

- Not a generic onboarding editor (like Pendo / UserGuiding). Flows live in code; content lives in MDX.
- No per-org custom onboarding at Phase 2. Content is consistent across orgs; white-label only affects branding (logo/color).
- No interactive tutorials / product tours of the main app. Those are a Phase 3+ concern ("product education").
- No gamified progress / achievements at Phase 2. If introduced later, they slot into contribution-estimation.

## User stories

- **As a newly signed-up developer**, I see a short 3-step onboarding: profile fill-in, pick interests, connect GitHub (optional). Then I land on my dashboard.
- **As a student who was invited via a program**, I see an 8-step guided flow that covers program introduction, mentor assignment, commitment acknowledgment, profile, channels.
- **As an ambassador**, I see a 5-step flow focused on community membership, profile, commitments.
- **As a Monark admin joining a new deployment**, I'm walked through TOTP enrollment, a platform tour, and a primer on the admin surface.
- **As a Monark admin investigating a UX issue**, I can preview any role's onboarding flow in a sandbox without polluting real data.

## Data model

```prisma
model OnboardingSession {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  role           Role                            // role at enrollment — flow determined by this
  flowVersion    String                          // e.g., "developer.v1"; frozen at start
  startedAt      DateTime @default(now())
  completedAt    DateTime?
  abandonedAt    DateTime?                       // set by cron after 30 days inactive

  steps          OnboardingStepState[]

  @@unique([userId, organizationId])             // one active session per user+org
  @@index([userId])
}

model OnboardingStepState {
  id         String   @id @default(cuid())
  sessionId  String
  session    OnboardingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  stepKey    String                              // "profile", "pick-interests", "github-connect"
  status     StepStatus                          // PENDING, COMPLETED, SKIPPED
  completedAt DateTime?
  payload    Json?                               // step-specific data (e.g., selected interests)

  @@unique([sessionId, stepKey])
}

enum StepStatus {
  PENDING
  COMPLETED
  SKIPPED
}
```

Flow definitions live in code, keyed by role + version:

```ts
// packages/onboarding/src/server/domain/flows.ts

export type FlowStep = {
  key: string;
  title: string;
  required: boolean;
  Component: ComponentType<StepProps>;
  validate?: (payload: unknown) => StepStatus | Promise<StepStatus>;
};

export const FLOWS = {
  "developer.v1": {
    role: "DEVELOPER",
    steps: [profileStep, pickInterestsStep, connectGithubStep],
  },
  "student.v1": {
    role: "STUDENT",
    steps: [
      programIntroStep,
      profileStep,
      assignMentorStep,
      commitmentStep,
      channelsStep,
      firstTaskStep,
      learningPathStep,
      completionStep,
    ],
  },
  "ambassador.v1": {
    /* ... */
  },
  "admin.v1": {
    /* ... */
  },
} as const satisfies Record<string, FlowDefinition>;
```

Why versioned flow strings: we want to change flows without retroactively changing the steps a mid-flow user sees. A running session sticks with its flow version; new sessions use the latest.

## API surface

```ts
// packages/onboarding/src/server/index.ts

export async function getOrStartSession(
  userId: string,
  orgId: string,
  role: Role,
): Promise<OnboardingSession>;
//   Called on role assignment. Idempotent — returns existing session if one
//   exists for (user, org), otherwise creates.

export async function getCurrentStep(sessionId: string): Promise<FlowStep>;
//   The next PENDING step, or null if completed.

export async function getProgress(sessionId: string): Promise<{
  completed: number;
  total: number;
  percent: number;
  nextStepKey: string | null;
}>;

("use server");
export async function completeStep(stepKey: string, payload?: unknown): Promise<void>;

("use server");
export async function skipStep(stepKey: string): Promise<void>;
//   Only allowed for non-required steps.

// Admin-only
("use server");
export async function previewFlow(role: Role): Promise<string>;
//   Returns a preview URL that simulates the flow in a sandboxed session
//   the admin can navigate without side-effects.
```

## UI flows

### Router entry (`/onboarding`)

- On every authed request, middleware checks if the user has an active `OnboardingSession` with `completedAt === null`. If so, certain routes are soft-gated (we redirect from `/app` to `/onboarding` with a banner "finish onboarding" link — browsing docs remains allowed).
- `/onboarding` resolves the current step and renders it.
- Progress indicator at the top: X of Y steps, with completed / pending / skipped state dots.

### Step component contract

Each step is a server component that receives `stepKey` and `payload` and renders its own UI. It submits via server actions that call `completeStep`. Validation is either synchronous (Zod) or async (e.g., verify GitHub connection exists).

Example — the `profile` step:

```tsx
export default async function ProfileStep({ session }: StepProps) {
  const user = await getById(session.userId);
  return (
    <OnboardingStepShell title="Tell us about yourself">
      <ProfileForm
        defaults={user}
        onSubmit={async (formData) => {
          "use server";
          await users.updateProfile(parseProfile(formData));
          await completeStep("profile");
          revalidatePath("/onboarding");
        }}
      />
    </OnboardingStepShell>
  );
}
```

### Standard steps (cross-role)

- `profile` — display name, avatar, locale. Common to all roles.
- `totp-enroll` — required for Admin; optional-but-encouraged for others (with "skip and enable later" secondary CTA). Integrates with `auth-totp.md`.
- `verify-email` — shown if user isn't verified yet. Pings user to check email; auto-advances when verification event fires.

### Role-specific sketches

**Developer flow** (3 steps):

1. Profile
2. Pick 3–5 interests (tags drive recommended content / peers — consumed in Phase 3)
3. Connect GitHub (optional — unlocks contribution signals)

**Student flow** (8 steps):

1. Program intro (branded page; what to expect)
2. Profile
3. Verify program enrollment (check against a Program model owned by onboarding)
4. Assign mentor (pick from list of available Developers; see Dependencies)
5. Commitment acknowledgement (click-through agreement)
6. Channels (join Slack / Discord; optional, but strongly encouraged)
7. First task (small ice-breaker exercise; payload stored in session)
8. Completion — summary, CTA to dashboard

**Ambassador flow** (5 steps):

1. Welcome + community standards
2. Profile (extended — add bio, social links)
3. Define region / community
4. Commitments (time expectations)
5. Completion + "how to earn rewards" primer (teases Phase 3 contributions)

**Admin flow** (4 steps):

1. TOTP enrollment
2. Org settings tour (prompted edit — set logo / primary color)
3. Invite first teammates
4. Dashboard tour

### Admin preview mode (`/admin/onboarding/preview`)

- Select role → launches `/onboarding?preview=1&role=developer`.
- Session is a transient in-memory simulation; server actions short-circuit (log what would have happened, no writes).
- Banner: "Preview mode — no changes will be saved."

## Dependencies

- `users` — profile updates on the profile step.
- `auth-totp` — TOTP step integrates enrollment flow.
- `auth-email-validation` — verify-email step consumes the verified event.
- `organizations` — session is org-scoped.
- `rbac` — role determines which flow to load.
- `feature-flags` — each flow version is gated by a flag (`onboarding.developer.v1`, `onboarding.student.v1`) so we can dark-launch new versions.

## Integration points

### Events emitted

```ts
export const ONBOARDING_STARTED = "onboarding.started";
export const ONBOARDING_STEP_COMPLETED = "onboarding.step-completed";
export const ONBOARDING_STEP_SKIPPED = "onboarding.step-skipped";
export const ONBOARDING_COMPLETED = "onboarding.completed";

export type OnboardingCompletedEvent = {
  userId: string;
  organizationId: string;
  role: Role;
  flowVersion: string;
  durationMs: number; // time from start to complete
  completedSteps: string[];
  skippedSteps: string[];
  at: Date;
};
```

Contribution-estimation (Phase 3) consumes `ONBOARDING_COMPLETED` to register the user for rewards. Voting (Phase 3) uses the same event to enable voting eligibility.

### Events consumed

- `rbac.role-assigned` → create an onboarding session when a new role is assigned (if none exists or the new role changes the flow).
- `user.email-verified` → auto-complete the `verify-email` step.
- `totp.enabled` → auto-complete the `totp-enroll` step.
- `organization.member-joined` → mark the "joined org" implicit step done.

## Edge cases

- **User's role changes mid-onboarding.** Current session is abandoned (`abandonedAt` stamped) and a new session for the new role starts. User sees a banner explaining.
- **User completes onboarding, then joins a second org.** A new session is created scoped to that org. Same role, different onboarding state.
- **Flow version upgraded while session is active.** Session sticks with its version. If urgent (a required step is buggy), we can bump `abandonedAt` and restart via an ops command — explicit, not automatic.
- **User skips all optional steps then completes.** Totally fine. Log which steps were skipped; analytics will tell us which optional steps are actually optional.
- **Required step fails validation.** User stays on the step; clear error message. Cannot move on.
- **Student flow references external program enrollment.** If the enrollment record is missing, the "verify enrollment" step blocks. Fallback: a "contact your program coordinator" message.

## Risks

- **Overlong flows kill completion rates.** Student flow at 8 steps is borderline. Track drop-off per step; cut or reorder aggressively.
- **Flow versioning churn.** Bumping versions creates orphaned old sessions. Cron `abandonedAt` stamps after 30 days of inactivity.
- **Content rot.** Copy in onboarding ages. Assign an owner per flow; quarterly review.
- **Role coupling creep.** Each step could end up querying cross-module data (e.g., the mentor step queries an unbuilt "mentoring" system). Resist: if a step needs data a module doesn't expose, don't hack around it — add the read interface to the module first.

## Success metrics

- Completion rate per role (primary KPI).
- Median time-to-complete per role.
- Drop-off heatmap: at which step do users stop?
- Skip rate per optional step — high skip on something we think matters signals a framing issue.
- Post-onboarding 7-day retention, segmented by completed vs. abandoned.

## Implementation notes

- Flow definitions are imported at module init; the `flowVersion` string in `OnboardingSession` must match a registered flow. On boot, validate that all active sessions reference a known version; log warnings for any orphans.
- Step components are async server components; their data fetching runs on the server. Client components inside are fine for interactive bits (form state).
- Preview mode: gate with `requirePermission("admin:preview-onboarding")`; use an in-memory session stored in request context, not DB.
- MDX content for copy-heavy steps (program intro, ambassador welcome) lives in `packages/onboarding/src/client/content/**.mdx`; renders with the shell's `next-mdx-remote` setup or via React imports directly.

## Out of scope

- Visual flow editor
- Branching flows based on quiz / survey answers (a single linear sequence per role for now)
- Localization of onboarding content (English only at launch)
- Mobile-specific UX
- A/B testing of flow variants (future; overlaps with feature-flags if revisited)
