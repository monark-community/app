# Raising the bar — systemic changes to how we collaborate

This is the "what to change about the process" report the review was ultimately for. The four technical reports found ~90 individual issues ; fixing them one by one is treating symptoms. This document targets the **causes** — the gaps in how work is planned, written, reviewed, and shipped that let those issues in despite a codebase whose written standards are, on paper, excellent.

## The core diagnosis

**The standards are outstanding ; the enforcement is manual and inconsistent, and the person writing the code is the only person checking it.** Read that against the evidence:

- CLAUDE.md mandates layout-accurate skeletons, org-scoped permission checks, no non-null `!`, and en+fr i18n. The review found violations of _every one_ of those — always in the newest code (calendar), never in the oldest (auth, projects). The rules didn't get worse ; the discipline to apply them decayed as novelty and time pressure rose.
- The repo has a codegen-drift CI gate — and the working tree currently _fails_ it (calendar unmanifested). A gate that the shipping branch violates isn't gating.
- 44 of 52 commits are by one author ; ~7 weeks of work (114 files) sit uncommitted on one machine. There is no second pair of eyes and no durable copy.

So the systemic fixes are not "write more rules." They are: **make the machine enforce the rules that already exist, make review a real gate, shrink the unit of work so quality is checkable, and reduce the bus factor.** In rough priority order:

---

## 1. Convert written conventions into executable gates

Every rule that lives only in CLAUDE.md is a rule that depends on memory. Move them into tooling so they fail loudly, not silently.

- **A "module completeness" CI check.** Extend `tools/check-tiers.ts` to assert: every `packages/*` exporting `./server` appears in `modules.manifest.ts` ; every module has a `contracts/events.ts` and a README ; every module with a tRPC surface has at least one integration test file. This single check would have caught M-C1, the calendar events gap, the missing projects README, and the calendar test gap — four separate findings, one gate.
- **Lint the banned constructs.** `no-non-null-assertion`, `no-restricted-syntax` for `publicProcedure` in a mutation without a following `requirePermission`, and a custom rule (or a grep-based CI step) forbidding `window.confirm`, bare `toLocaleString()`, and hardcoded JSX strings outside the messages files. The review found ~70 `!`s, several `window.confirm`s, and hardcoded strings that all violate existing written rules — lint makes them un-mergeable instead of un-noticed.
- **i18n parity + hardcoded-string CI check.** Parity is currently perfect (1262/1262) — lock that in with a test that diffs the two key sets and fails on drift, plus a scan for user-visible literals in `.tsx`. Cheap insurance on something already good.
- **Turn on the coverage thresholds that are already wired but commented out** (`docs/todo/backlog.md` notes they're off). Start per-package at the current level as a ratchet — never allow a package's coverage to drop — rather than a flat 75% that blocks work.
- **Make CI green a precondition, enforced by branch protection** (see §4). Right now `main` can receive a tree that fails codegen ; that must be impossible.

Rule of thumb going forward: **a convention that matters enough to write down is worth a check ; if it's not worth a check, drop it from CLAUDE.md.** Documentation of a rule and enforcement of a rule should be the same artifact wherever possible.

## 2. Make review an actual gate — even as a solo/small team

The strongest predictor of the findings' distribution is that no one reviews the code but its author. Introduce review as a hard step, and use tooling to make it feasible without a second human always available:

- **Branch + PR for every change ; no direct commits to `main`.** The recent history is full of "Fix lint", "Fix build", "Fix codecov" — commits that repair the previous commit. Those are what post-merge, no-review, work-straight-on-main produces. PRs with green CI before merge eliminate the class.
- **A definition-of-done checklist enforced on the PR, not in a doc.** CLAUDE.md already has the DoD list — turn it into a PR template with real checkboxes (RBAC gated? event emitted or consciously N/A? en+fr? skeleton? error state? CHANGELOG entry? `pnpm gen` fresh?). The "error state?" box alone would have surfaced the systemic E-1/E-2 gap.
- **Use the AI review tooling that's already in this environment as the standing second reviewer.** `/code-review` on the working diff and `/security-review` on the branch before each PR gives an adversarial pass on exactly the axes this review covered. Make "security-review clean" a merge requirement for anything touching an auth, RBAC, or tenancy path — the C1/H2/H3/H4 findings are precisely what it catches.
- **Adopt a "new code meets current standards" rule.** The calendar module is the counter-example: it was written to an earlier, looser bar. A reviewer (human or AI) whose explicit job is "does this match how projects/industries do it?" would have caught the pattern divergence, the `window.confirm`s, and the missing skeletons at authoring time.

## 3. Shrink the unit of work so quality is checkable

A 114-file, 4,600-line uncommitted change cannot be reviewed, cannot be reasoned about, and cannot be safely reverted. The size of the change _is_ a quality risk.

- **Land work in small, single-concern PRs.** The CHANGELOG shows the team already thinks in discrete, well-scoped units (each entry is one coherent change) — the git history just doesn't match that granularity. Make commits as granular as the CHANGELOG entries already are.
- **Commit early and often ; push daily.** This is also the bus-factor fix (§5). Seven weeks on one disk is an outage away from gone.
- **Prefer a feature flag over a long-lived branch.** The repo has a first-class flag system — incomplete work can ship behind `defaultOn: false` and be reviewed in small pieces, instead of accumulating uncommitted. This is the intended use of the tooling that already exists.

## 4. Fix the "fix-forward on main" loop

The commit log (`Fix codecov` → `Fix build` → `Fix lint`) shows CI failures being discovered _after_ merge and patched in follow-ups. Move that leftward:

- **Run the full pre-PR gate locally as a pre-push hook** — `simple-git-hooks` is already a dependency. `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers` on pre-push turns three "fix" commits into zero.
- **Branch protection on `main`:** require the CI checks to pass and require the PR to be up to date before merge. This is the mechanical guarantee behind §2.
- **Keep the fast/slow test split** (it's good) but ensure the pre-push hook runs at least typecheck + lint + unit + `check:tiers` + `gen --check` so the common failures never reach CI.

## 5. Reduce the bus factor

One author, one uncommitted working tree, undocumented product decisions living in one head (the identity ambiguity in the product report is a symptom).

- **Push daily ; protect the history off-machine** (covered above, but it's the #1 operational risk in the whole review).
- **Write decisions down as ADRs.** The product report found three competing identities (community hub / SaaS kernel / data platform) because the pivots were never recorded. A lightweight `docs/decisions/` with one file per significant choice (tenancy model, product identity, "defer polymorphic-DB until telemetry") makes the reasoning survivable and reviewable.
- **Treat the AI reviewers as a durable second opinion** where a human teammate isn't available — not a replacement for a human, but far better than nothing for a solo maintainer.

## 6. Close the feedback loop with the product itself

You cannot raise standards on outcomes you don't measure.

- **Add basic telemetry** (product report): even a first-party counter fed by the existing wildcard event subscriber answers "is anyone using Calendar?" — which should gate whether the polymorphic-DB rewrite happens at all.
- **Add error tracking** (Sentry or equivalent). The review found no error boundaries _and_ no error reporting — so a production exception is invisible twice. Wiring one makes the E-1 error-boundary work pay double.

---

## Concrete first two weeks

A sequenced, non-overwhelming rollout — process changes first because they prevent regressions in the fixes that follow:

1. **Day 1:** Commit + tag the working tree ; fix C1 (flag auth) and M-C1 (manifest + `pnpm gen`) so `main` is green and secure. Turn on branch protection.
2. **Day 2-3:** Pre-push hook (`simple-git-hooks`) running the pre-PR gate ; PR template from the DoD checklist ; make `/security-review` a required step for auth/RBAC/tenancy PRs.
3. **Week 1:** Extend `check-tiers.ts` into the module-completeness gate ; add the `no-non-null-assertion` and i18n-parity lint/CI rules ; flip on per-package coverage ratchets.
4. **Week 2:** Extract `orgScopedProcedure` (kills the IDOR class and ~40 duplications at once) ; add `(authed)/error.tsx` + DataTable `errorState` ; start the calendar conformance pass. Begin `docs/decisions/` with the product-identity ADR.

## The through-line

Nothing here asks the team to be more careful — "be more careful" is what already failed. It asks the team to **encode the care that already exists in CLAUDE.md into gates, reviews, and small reversible steps**, so that the quality of the auth module (written early, carefully, and tested) becomes the automatic floor for the next module, instead of a bar each new module has to clear by memory and willpower. The codebase has already proven the team can build to a very high standard. The systemic change is making that standard the _default_, not the _achievement_.
