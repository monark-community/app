# Phase 3 — Implementation order

> **Status: not built.** Voting and contribution-estimation are still _proposed_ specs (now under [`../proposed/`](../proposed/)) ; this doc is the original sequencing plan for that unbuilt work. What actually shipped in this phase was Data Model file-fields, the calendar/kanban visualization verdict, and the public API (see [`../README.md`](../README.md)).

## Goal

Ship the two value-capture extended modules. Voting lets the community make decisions that affect them; contribution estimation turns ambient activity into a quantifiable signal for reward distribution. Phase 3 is done when both modules are live, emitting and consuming events cleanly, and the executive team trusts the contribution scores enough to actually distribute rewards from them.

## Order

1. **[`voting-system.md`](../proposed/voting-system.md)**
   Ship first. Ballot participation is one of the activity signals that contribution-estimation weighs, so voting needs to be live and emitting `ballot.cast` (and related) events before estimation can be tested against real data. Voting has the cleaner dependency profile (users + rbac only) and can be validated end-to-end without waiting on anything else.

2. **[`contribution-estimation.md`](../proposed/contribution-estimation.md)**
   Ship second. It consumes events from onboarding (progress milestones), voting (participation), and external systems (GitHub activity, code review, etc.). The scoring model lands last because it needs real event volume to calibrate against, which only exists after Phase 2 has been live for a while and voting (step 1) is emitting.

## Exit criteria

- Admins can open a vote; eligible users (per rbac scope) cast ballots; results tabulate correctly and visibly.
- Contribution scores update from the event stream within the documented lag target (see [`contribution-estimation.md`](../proposed/contribution-estimation.md)).
- Scores are reproducible: replaying the event log yields the same score within a documented tolerance.
- No cross-module imports between voting and contribution-estimation; only events + core read interfaces. `pnpm check:tiers` passes.
- Both modules are flag-gated; rollbacks are a flag flip.

## Parallelization

Contribution-estimation's schema + event subscribers can be scaffolded in parallel with voting (the subscribers hook onto event types that are already declared in voting's `/contracts`). But real validation of the scoring model requires voting to be emitting actual events, so the sequence effectively serializes around calibration.

## Sequencing risks

- **Shipping contribution-estimation's UI before voting is live is tempting** because dashboards are visible and motivating. Don't. A dashboard built on fabricated or skeletal data is a lie; ship it only when the event stream is real.
- **Treating contribution-estimation as a pure read-model is tempting**. Don't. The scoring model has opinions (weights, decay, caps) that are product decisions, not infrastructure; they need review like any other feature, and they need to be tunable via configuration rather than code.
- **Letting voting reach into contribution-estimation to "report participation" is tempting** when the eventing feels indirect. Don't. It would couple two extended modules. Voting emits; estimation subscribes; nothing else.

## What Phase 3 deliberately does not do

- No reward payout. Phase 3 produces the score; actually distributing rewards (tokenized or otherwise) is a downstream concern with its own compliance surface.
- No adaptive / risk-based signals. Contribution-estimation's v1 is static-weight scoring; adaptive weights are a future iteration.
- No public leaderboards without admin approval. Visibility rules are part of the spec; default is internal-only.
