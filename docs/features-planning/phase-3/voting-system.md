# Voting System

## Context

The starter brief lists decentralized voting as a key Monark-exec priority. "Decentralized" here means the outcome isn't predetermined by Monark staff; developers and ambassadors have real voice on decisions the community cares about — roadmap priorities, budget allocation, community-coordinated initiatives.

This is a governance feature. It's Phase 3 because it needs a live user base (Phase 1) and a way to track who's eligible (roles from `rbac`, activity from `onboarding` and `contribution-estimation`). It also needs an audit trail that's defensible — the outcome of a vote can't be quietly edited after the fact.

## Goals

- Proposals can be created by eligible roles (`voting:create-proposal` permission).
- Proposals go through lifecycle states: draft → open → closed → tallied → archived.
- Voters cast ballots: yes / no / abstain, optionally weighted by a configurable weight function.
- Ballots are stored atomically; tallies are reproducible from ballots.
- Results are published with a breakdown and a signed timestamp; amendments to the tally require a new vote on an amended proposal.
- Voter eligibility per-proposal configurable (all eligible roles, or a subset; min contribution score, etc.).
- Pseudonymous results — individual ballots are not public, but a voter can prove their own ballot to themselves via a receipt.

## Non-goals

- Not on-chain. "Decentralized" in our product sense ≠ blockchain. We don't run our own L1; the value is democratic participation, not cryptographic trustlessness at the chain level.
- No quadratic voting / conviction voting / liquid democracy at Phase 3 launch. Maintain optionality — the weight function is pluggable — but ship with a simple per-vote weight.
- No proposal templates / workflow engines. A proposal is free-form markdown + options.
- No anonymous voting. Voters are identified; ballots are pseudonymous only to other voters.
- No paid boosting / proposal promotion.

## User stories

- **As a developer**, I can create a proposal, fill in a markdown description, set a voting window, choose eligibility, and submit.
- **As an eligible voter**, I see open proposals on `/voting`, read the description, cast my ballot (yes / no / abstain) with optional comment.
- **As a voter**, I can see a receipt of my own vote at any time but cannot see others' individual ballots.
- **As an admin**, I can see every proposal, including drafts; I can force-close early if abusive content is found (with audit trail).
- **As a stakeholder after a vote**, I see the final tally, participation rate, breakdown by role, all on a permanent results page.

## Data model

```prisma
model Proposal {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  authorId        String
  author          User     @relation(fields: [authorId], references: [id])

  title           String
  body            String    // MDX-renderable
  summary         String?   // optional one-liner

  state           ProposalState
  openAt          DateTime?
  closeAt         DateTime?
  publishedAt     DateTime?

  // Eligibility — resolved at vote cast time, not at proposal creation
  eligibilityRoles        Role[]
  eligibilityMinContributionScore Int?

  // Weight function — identifier from a registered set; default "one-voter-one-vote"
  weightFunction  String   @default("one-voter-one-vote")

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  ballots         Ballot[]
  amendments      ProposalAmendment[]          // structured edits, each a new version
  tally           Tally?
}

enum ProposalState {
  DRAFT
  OPEN
  CLOSED              // voting ended, tally running
  TALLIED             // results computed + signed
  ARCHIVED            // voluntarily closed by admin; tally incomplete
}

model Ballot {
  id             String   @id @default(cuid())
  proposalId     String
  proposal       Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  voterId        String
  voter          User     @relation(fields: [voterId], references: [id])

  choice         Choice                         // YES, NO, ABSTAIN
  weight         Decimal  @db.Decimal(10, 4)    // computed from weightFunction
  comment        String?

  castAt         DateTime @default(now())

  // A receipt the voter can use to prove their own vote
  receiptHash    String   @unique

  @@unique([proposalId, voterId])               // one ballot per voter per proposal
  @@index([proposalId])
}

enum Choice {
  YES
  NO
  ABSTAIN
}

model Tally {
  id                String   @id @default(cuid())
  proposalId        String   @unique
  proposal          Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  totalEligible     Int
  totalParticipants Int
  yesWeight         Decimal  @db.Decimal(14, 4)
  noWeight          Decimal  @db.Decimal(14, 4)
  abstainWeight     Decimal  @db.Decimal(14, 4)

  breakdownByRole   Json     // { DEVELOPER: { yes, no, abstain, weight }, ... }
  signedAt          DateTime @default(now())
  signatureHash     String   // SHA-256 of the canonical serialized tally + a signing secret
}

model ProposalAmendment {
  id          String   @id @default(cuid())
  proposalId  String
  proposal    Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  editedById  String
  editedBy    User     @relation(fields: [editedById], references: [id])

  fromBody    String
  toBody      String
  rationale   String
  editedAt    DateTime @default(now())
}
```

Edits to a proposal after it goes `OPEN` are recorded as amendments, not mutations. The public view always shows the version at the time of the ballot.

## API surface

```ts
// packages/voting/src/server/procedures/proposals.ts

"use server";
export async function createProposal(input: {
  title: string;
  body: string;
  summary?: string;
  openAt: Date;
  closeAt: Date;
  eligibilityRoles: Role[];
  eligibilityMinContributionScore?: number;
  weightFunction?: string;
}): Promise<Proposal>;

("use server");
export async function updateProposalDraft(id: string, patch: Partial<Proposal>): Promise<Proposal>;
//   Only works while state === DRAFT.

("use server");
export async function openProposal(id: string): Promise<void>;
//   Transition DRAFT → OPEN (if openAt <= now); otherwise scheduled.

("use server");
export async function amendProposal(id: string, newBody: string, rationale: string): Promise<void>;
//   Only for OPEN proposals; records a ProposalAmendment.

("use server");
export async function forceClose(id: string, reason: string): Promise<void>;
//   Admin-only; transitions to ARCHIVED with reason logged.

// packages/voting/src/server/procedures/ballots.ts
("use server");
export async function castBallot(input: {
  proposalId: string;
  choice: Choice;
  comment?: string;
}): Promise<{ receiptHash: string }>;

("use server");
export async function changeBallot(input: {
  proposalId: string;
  choice: Choice;
  comment?: string;
}): Promise<{ receiptHash: string }>;
//   Allowed only while the proposal is OPEN. New receipt issued, old ballot
//   superseded (keep history in a BallotHistory table for audit).

// Read
export async function listProposals(filter?: {
  state?: ProposalState;
  orgId?: string;
}): Promise<ProposalView[]>;
export async function getProposal(id: string): Promise<ProposalDetail>;
export async function getMyBallot(proposalId: string): Promise<Ballot | null>;
export async function getTally(proposalId: string): Promise<Tally | null>;
```

### Permissions

- `voting:create-proposal` — Admin, Developer.
- `voting:cast` — Admin, Developer, Ambassador.
- `voting:force-close` — Admin, MonarkAdmin.
- `voting:view-all-proposals` — Admin, MonarkAdmin.

## Weight functions

Registered in code:

```ts
// packages/voting/src/server/domain/weights.ts

export const WEIGHT_FUNCTIONS = {
  "one-voter-one-vote": async (user, proposal) => 1,
  "contribution-weighted": async (user, proposal) => {
    const score = await contributions.getScore(user.id, proposal.organizationId);
    return Math.min(10, Math.log2(1 + score));
  },
  "role-weighted": async (user, proposal) => {
    const role = await rbac.primaryRole(user.id, proposal.organizationId);
    return { ADMIN: 2, DEVELOPER: 1.5, AMBASSADOR: 1, STUDENT: 0.5 }[role] ?? 0;
  },
} as const;
```

The proposal creator picks from the available functions; new ones ship behind feature flags.

## UI flows

### Proposals list (`/voting`)

- Tabs: Open, Closed, My Proposals, Drafts (if author).
- Each row: title, author, state, open / close times, participation bar (for open ones), quick-vote buttons.

### Proposal detail (`/voting/<id>`)

- MDX-rendered body at the top.
- Voting card: Yes / No / Abstain buttons, optional comment field. Shows your current ballot + "Change vote" if you've already cast.
- Tally bar (live during open proposal but intentionally coarse: "67 ballots cast of 240 eligible"). Full breakdown hidden until close.
- Amendments section: a log of edits the author made post-open, with rationale.

### Post-tally (`/voting/<id>/results`)

- Final tally with breakdown.
- Participation rate.
- Signed result block (hash + timestamp) visible for verification.
- Link back to the version of the proposal at close time.

### Create / draft (`/voting/new`)

- Multi-step form:
  1. Title + summary
  2. Body (MDX editor with preview)
  3. Eligibility (role checkboxes, optional min-contribution)
  4. Schedule (openAt / closeAt)
  5. Weight function (radio group with explainer)
  6. Review → publish as draft or submit to open immediately

### Admin list (`/admin/voting`)

- Every proposal across orgs (MonarkAdmin) or within-org (Admin).
- Force-close, view audit trail, re-run tally (in case of suspected computation bug).

## Dependencies

- `rbac`: role-based eligibility + permission checks.
- `users`: voter identity.
- `organizations`: proposals are per-org.
- `feature-flags`: `voting.system`, `voting.contribution-weighted`, `voting.change-ballot`.
- `contribution-estimation` (same phase): consumed by `contribution-weighted` and eligibility filter.
- `onboarding` (Phase 2): only users who've completed onboarding can vote — enforced in `castBallot`.

## Integration points

### Events emitted

```ts
export const PROPOSAL_CREATED = "voting.proposal-created";
export const PROPOSAL_OPENED = "voting.proposal-opened";
export const PROPOSAL_CLOSED = "voting.proposal-closed";
export const PROPOSAL_AMENDED = "voting.proposal-amended";
export const BALLOT_CAST = "voting.ballot-cast";
export const BALLOT_CHANGED = "voting.ballot-changed";
export const TALLY_PUBLISHED = "voting.tally-published";

export type BallotCastEvent = {
  proposalId: string;
  voterId: string;
  choice: Choice;
  weight: number;
  at: Date;
};
```

Contribution-estimation consumes ballot events to award participation points (configurable; only counts for "cast ballot," not for choice).

### Scheduled transitions

A cron runs every 5 minutes:

- DRAFT → OPEN: if `openAt <= now`.
- OPEN → CLOSED: if `closeAt <= now`.
- CLOSED → TALLIED: computes the tally, signs it, stores. Emits `TALLY_PUBLISHED`.

Implemented as a Supabase scheduled function or a Vercel cron hitting `/api/cron/voting-transitions`.

### Tally signing

The tally's `signatureHash` is `SHA-256(canonical_json(tally) + HMAC_SECRET)`. Not true cryptographic democracy; sufficient to detect post-hoc edits. Storing the HMAC secret in an env var is fine for Phase 3; revisit if signing becomes a trust boundary.

## Edge cases

- **Voter's role changes mid-vote.** Ballot is stamped with the weight computed at cast time. Changing roles doesn't retroactively adjust prior ballots.
- **Voter is deleted between cast and tally.** Ballot remains in the tally (the vote happened). Display shows "Deleted user" in anonymized audit views.
- **Proposal ends with no ballots.** Tally shows 0 participation; `YES = NO = 0`. Valid outcome, just inconsequential.
- **Weight function errors** (e.g., contribution service down). Degrade to weight 0 for that voter and log loudly; don't silently count as weight 1.
- **Simultaneous ballot + change-ballot.** Transactional: the unique constraint on `(proposalId, voterId)` prevents duplicates; `changeBallot` does UPSERT semantics inside a transaction that also writes a `BallotHistory` entry.

## Risks

- **Vote manipulation via Sybil accounts.** We rely on the broader anti-abuse posture (email verification, one signup per email, optional TOTP for admins). Per-org flow makes org-level vote-packing harder.
- **Perceived unfairness.** Weight functions favor engaged users; students feel shut out. Mitigate with clear explanation on each proposal: "This vote uses contribution-weighted voting because…"
- **Amendment abuse.** Author changes the body post-open to bait supporters. Amendments are visible, but the UX must make this prominent — banner at top of the proposal if any amendments exist.
- **Tally disputes.** Signed hash gives a credible "this was the result at time T." Disputes about the tally itself re-run the deterministic compute from ballots; mismatch would indicate a bug.

## Success metrics

- Proposal creation rate (organic, not Monark-seeded).
- Participation rate among eligible voters.
- Proposal-to-decision lag (time from close to tally publication; should be < 5 min).
- Tally re-computation consistency (should be 100% reproducible).
- Ballot-change rate (high change rate suggests users don't understand the vote up front).

## Implementation notes

- Tally computation is pure and deterministic given the ballots. Unit tests iterate a synthetic ballot set and verify weights sum correctly per role.
- Proposal body is MDX-sanitized on submit: disallow raw HTML, forbid external scripts.
- Use DB transactions for `castBallot` / `changeBallot` to avoid races between the eligibility check and the insert.
- The "receipt" is `SHA-256(voterId + proposalId + choice + castAt)`; user can reproduce with their own voting history to verify their ballot recorded correctly.

## Out of scope

- Blockchain-backed vote storage
- Quadratic / conviction / liquid voting variants (at launch)
- Delegated voting (vote on behalf of someone)
- Multi-choice polls (ranked choice, approval voting). The three-option primitive is first; expand if a clear proposal class needs it.
- Embed / API for externally-hosted proposal pages
