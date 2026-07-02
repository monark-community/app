# Contribution Estimation System

## Context

The starter brief names "contributions quantification (for rewards)" as a key executive priority. Monark wants to reward developers, ambassadors, and students for their contributions — code, content, mentorship, voting, referrals — and pay out against a reproducible score, not vibes.

This module is the accounting layer. It consumes signals from every other module (onboarding completion, ballots cast, referrals converted, external integrations like GitHub) and produces a per-user `contribution score`. It does NOT pay out. Payout is an external system's job (same pattern as `referral-system`) — we emit eligibility events; somebody else cuts the cheque.

## Goals

- Per-user score per-org, updated continuously as signals arrive.
- Pluggable rule engine: a signal + rule = points. Rules are versioned; changing a rule doesn't retroactively re-score.
- Rule catalog in code, values tunable via admin UI (not deploy).
- User-facing "My contributions" dashboard showing a breakdown.
- Admin view: per-user, per-org, per-rule analytics.
- Transparent audit trail: every point is traceable to a signal and a rule version.
- Reward-eligibility events consumed by the external payout system.

## Non-goals

- No payouts. We report score; somebody else converts score to reward.
- No cash-equivalent math in this module. If one point ≠ $1, the mapping lives in the external system.
- No leaderboards at launch. (Roadmap item, but they create perverse incentives early.)
- No real-time adjustments / "streak bonuses." Keep the signal model clean; add gamification on top if needed.
- No contribution weighting based on peer review at launch. Trusted signals only — user-reported contributions come later.

## User stories

- **As a developer**, I can see on `/contributions` a breakdown of my score: signals earned, rule applied, points awarded, cumulative total.
- **As a student**, I can see how my onboarding progress, voting participation, and mentor check-ins add to my score.
- **As an admin**, I can see aggregate contribution for my org: top contributors, rule-usage distribution, month-over-month trend.
- **As a MonarkAdmin**, I can create / edit rules, change point values (with a dated effective-from), sunset rules, inspect the raw signal stream.
- **As the external payout system**, I can query `/api/contributions/eligible?orgId=...&from=...&to=...` to get everyone eligible for a reward in a given period.

## Data model

```prisma
model Rule {
  id              String   @id @default(cuid())
  key             String                          // "voting.ballot-cast", "referral.converted"
  version         Int                             // monotonic per key
  name            String
  description     String
  points          Int                             // can be negative (e.g., penalty)
  category        RuleCategory                    // PARTICIPATION, REFERRAL, CONTRIBUTION, PENALTY
  active          Boolean  @default(true)
  effectiveFrom   DateTime
  createdById     String
  createdAt       DateTime @default(now())

  @@unique([key, version])
  @@index([key, active])
}

enum RuleCategory {
  PARTICIPATION
  REFERRAL
  CONTRIBUTION
  EDUCATION
  PENALTY
}

model Signal {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  ruleKey         String                          // which rule this signal maps to
  sourceEvent     String                          // domain event type (e.g., "voting.ballot-cast")
  sourceEventId   String?                         // domain_events.id for traceability
  metadata        Json                            // event-specific payload
  at              DateTime                        // when the underlying activity happened

  // Denormalized for fast queries — the Rule.version at the time of signal capture
  appliedRuleVersion Int
  appliedPoints   Int

  // Reversal / correction tracking
  reversedAt      DateTime?
  reversedReason  String?

  createdAt       DateTime @default(now())

  @@index([userId, organizationId])
  @@index([ruleKey, at])
}

model ScoreSnapshot {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  score           Int
  signalsCount    Int
  asOf            DateTime

  @@unique([userId, organizationId, asOf])
  @@index([organizationId, asOf])
}
```

`ScoreSnapshot` is a daily rollup for fast reads; the live score is computed from signals when accuracy matters.

## API surface

### Read

```ts
// packages/contributions/src/server/index.ts

export async function getScore(userId: string, orgId: string): Promise<number>;
//   Sum of appliedPoints across non-reversed signals.
//   Cached in ScoreSnapshot for yesterday + sum of today's signals live.

export async function getBreakdown(
  userId: string,
  orgId: string,
  opts?: { range?: { from: Date; to: Date } },
): Promise<ScoreBreakdown>;
//   Per-rule totals, time series by day/week/month.

export async function listTopContributors(
  orgId: string,
  opts?: { limit?: number; range?: { from: Date; to: Date } },
): Promise<LeaderboardEntry[]>;
//   Admin-only at launch; public leaderboard deferred.
```

### Write (internal only)

Signals are _only_ captured by the event-consumer pipeline, never by direct API calls from other modules. This keeps the "what earns points" logic centralized.

```ts
// packages/contributions/src/server/domain/capture.ts (internal)

export async function captureSignal(input: {
  userId: string;
  organizationId: string;
  ruleKey: string;
  sourceEvent: string;
  sourceEventId?: string;
  metadata: Record<string, unknown>;
  at: Date;
}): Promise<Signal | null>;
//   Resolves the active Rule for this key, applies its points, writes.
//   Returns null if no active rule exists for that key (signal ignored).

export async function reverseSignal(signalId: string, reason: string): Promise<void>;
//   For corrections (e.g., spam referral retroactively disqualified).
```

### Admin

```ts
// packages/contributions/src/server/procedures/admin.ts

"use server";
export async function createRule(input: RuleInput): Promise<Rule>;

("use server");
export async function supersedeRule(key: string, newInput: RuleInput): Promise<Rule>;
//   Creates Rule{key, version: N+1} with new points; doesn't retroactively
//   change existing signals. effectiveFrom can be backdated only with
//   MonarkAdmin permission.

("use server");
export async function deactivateRule(key: string): Promise<void>;
//   Sets active=false; future signals of this key are dropped.

("use server");
export async function reverseSignalsAdmin(
  filter: {
    userId?: string;
    orgId?: string;
    ruleKey?: string;
    dateRange?: { from: Date; to: Date };
  },
  reason: string,
): Promise<number>;
//   Bulk reversal with audit trail.
```

### External integration

```ts
// packages/contributions/src/server/webhooks/eligible.ts
// GET /api/contributions/eligible?orgId=X&from=Y&to=Z
export async function GET(request: Request) {
  // HMAC-authenticated; rate-limited.
  // Returns paginated list of (userId, score, period) for the external
  // payout system to process.
}
```

## Rule catalog (initial)

| Key                         | Category      | Points     | Trigger                                                    |
| --------------------------- | ------------- | ---------- | ---------------------------------------------------------- |
| `onboarding.completed`      | EDUCATION     | 50         | `onboarding.completed` event                               |
| `onboarding.first-task`     | EDUCATION     | 20         | `onboarding.step-completed` where stepKey === "first-task" |
| `voting.ballot-cast`        | PARTICIPATION | 5          | `voting.ballot-cast`                                       |
| `voting.proposal-created`   | PARTICIPATION | 25         | `voting.proposal-created` + later boost on passage         |
| `voting.proposal-passed`    | PARTICIPATION | 100        | `voting.tally-published` with YES majority                 |
| `referral.converted`        | REFERRAL      | 200        | `referral.converted` → accrues to referrer                 |
| `referral.payout-confirmed` | REFERRAL      | 50 (bonus) | `referral.payout-confirmed`                                |
| `github.merged-pr`          | CONTRIBUTION  | 100        | External (GitHub webhook) — Phase 3 stretch                |
| `github.reviewed-pr`        | CONTRIBUTION  | 20         | External — stretch                                         |
| `mentor.session-completed`  | EDUCATION     | 30         | User-reported + counter-signed by mentor (future)          |
| `abuse.reported`            | PENALTY       | -500       | Admin action                                               |

Values are tunable; the catalog above is a starting point. Each rule has a reviewable page in the admin UI.

## UI flows

### My contributions (`/contributions`)

- Big number: current score.
- Stacked chart: points over time, broken down by category.
- Recent signals: timeline of "Earned 5 points for casting a ballot on 'Q4 Budget'" with links.
- Rule reference: expandable section explaining how points work, linking to the live rule catalog.

### Admin: rules (`/admin/contributions/rules`)

- Table of rules with current version, points, active state.
- Create / supersede / deactivate actions.
- Diff view: "You're changing voting.ballot-cast from 5 → 10 points. Effective 2026-05-01. Existing signals retain 5 points."

### Admin: org contributions (`/admin/contributions`)

- Leaderboard.
- Per-rule totals for the org.
- Time-range filter.
- Drill-down to any user's breakdown.

## Dependencies

- `users`: signals attached to users.
- `organizations`: scoped per-org.
- `rbac`: admin write operations guarded.
- `feature-flags`: `contributions.quantification` kill-switch; per-rule active state can also be flag-controlled for rapid rollback.
- **Event bus** (heavily): subscribes to `onboarding.*`, `voting.*`, `referral.*`, and any external-integration events.
- External: optional GitHub App integration for code-contribution signals; optional payout-system endpoint.

## Integration points

### Events consumed

This module is a subscriber, not a publisher, for most flows:

- `onboarding.completed` → `captureSignal({ ruleKey: "onboarding.completed" })`
- `voting.ballot-cast` → `captureSignal({ ruleKey: "voting.ballot-cast" })`
- `voting.tally-published` → read outcome, possibly fire `voting.proposal-passed`
- `referral.converted` → accrue to referrer
- `user.deleted` → mark all of that user's future signals as ineligible (historical signals stay for audit; no retro reversal unless admin-initiated)

### Events emitted

```ts
export const SIGNAL_CAPTURED = "contributions.signal-captured";
export const SIGNAL_REVERSED = "contributions.signal-reversed";
export const RULE_UPDATED = "contributions.rule-updated";
export const PAYOUT_PERIOD_CLOSED = "contributions.payout-period-closed";
```

`PAYOUT_PERIOD_CLOSED` is emitted by a monthly cron that snapshots scores and notifies the external payout system; that system then pays out and signals back via the referral webhook pattern.

## Edge cases

- **Duplicate signals from retries.** Use `sourceEventId` uniqueness per `(userId, ruleKey)` where present. If absent, idempotency falls back to `(userId, ruleKey, at)` with a short bucket window.
- **Rule changes mid-activity.** Signals are stamped with the rule version active at signal-capture time; later rule changes don't retro-adjust.
- **Retroactive reversal.** Admin can reverse a signal with a reason. Score recomputes; emit `SIGNAL_REVERSED`. External system is notified if it had already paid on that signal (manual workflow; don't auto-rescind money).
- **External signal (GitHub) arrives before user linked their GitHub account.** Parked in a staging table keyed by github-login; when the user connects, signals are attributed. Expire unattributed after 90 days.
- **User is in multiple orgs.** Scores are per-org. A referral conversion in org A doesn't give points in org B.
- **Clock skew.** `at` always uses server time for the `Signal` row regardless of what the underlying event reported.

## Risks

- **Gaming.** Any rule is gameable. Mitigate with: (a) signal-source requirements (server-emitted events, not user-claimed), (b) monitoring for anomalies (user who gets a 10x spike in a day), (c) ability to bulk-reverse with an audit trail.
- **Perverse incentives.** Rewarding ballot casts without regard to proposal quality encourages voting just to vote. Cap per-period (e.g., max 50 ballot points per month).
- **Complexity creep.** Rule engines tend to grow features until they become impossible to reason about. Keep the engine dumb: signal → active rule → points. No conditional chains, no compound rules; if a case needs it, make it two separate rules.
- **Privacy concerns on the admin view.** Admins see every user's score — treat as PII-adjacent. Include in privacy policy; don't expose cross-org.
- **External system mismatch.** We think we paid someone; they didn't receive. Resolved by the external system's `payout-confirmed` callback; un-confirmed eligibility is revisited at the next period close.

## Success metrics

- Signal capture latency (event → signal row): median < 1s.
- Score computation latency (user dashboard load): < 200ms via ScoreSnapshot + today's delta.
- Rule-change-to-effect lag: immediate for signals after the effective timestamp.
- External payout success rate (confirmed / eligible): > 95%.
- User-visible discrepancy reports: near zero (each is a bug).

## Implementation notes

- Score caching: `ScoreSnapshot` is written by a nightly rollup. Live score = yesterday's snapshot + today's signals. Recompute fully on rule change if the change is retroactive.
- Signal insert is idempotent via `sourceEventId` unique index.
- Admin rule updates are rate-limited and audit-logged; include before/after values in the audit entry.
- External `/api/contributions/eligible` endpoint paginates via cursor; never returns unbounded lists.
- Consider moving to a columnar store (e.g., ClickHouse) only if PostgreSQL grows slow on analytics queries. We're nowhere near that at Phase 3 launch; PG + proper indexes handles it.

## Out of scope

- Payout / reward disbursement
- Peer-to-peer endorsements ("X says Y is a great mentor" → signal)
- Public leaderboards
- Seasonal / limited-time rules (ad-hoc events with special scoring)
- Multi-currency / per-org reward mapping (lives externally)
- Governance of the rules themselves (meta-voting on point values — intriguing but premature)
