# Phase 2 — Implementation order

> **Status: not built.** Onboarding and referral are still _proposed_ specs (now under [`../proposed/`](../proposed/)) ; this doc is the original sequencing plan for that unbuilt work. The platform's actual phase-2-era deliverable was the shipped Data Models engine ([`polymorphic-db.md`](polymorphic-db.md) → [`@monark/data-models`](../../../packages/data-models/README.md)).

## Goal

The first two extended modules ship and get users in the door. Each is self-contained, consumes core read interfaces + events, and depends on no other extended module. When Phase 2 is done, a new user can land on a referral link and walk through onboarding end to end with correct attribution.

## Order

1. **[`user-onboarding.md`](../proposed/user-onboarding.md)**
   Ship first. Onboarding is the default first-run experience for every new user, so it has to exist before any other extended module can assume "this user has been greeted." It consumes the full core (auth, users, orgs, rbac) without depending on anything extended.

2. **[`referral-system.md`](../proposed/referral-system.md)**
   Ship second. Referral attribution slots into onboarding's "where did you come from" step rather than defining its own landing-page flow. Until onboarding exists, there's no runway to attribute users _into_.

## Exit criteria

- A new user landing on `/r/<referral-token>` is attributed correctly and walks through onboarding to completion.
- Onboarding emits `user.onboarded` events with role + org + completion timestamp; referral emits `referral.attributed` events. Phase 3's contribution-estimation will subscribe to both.
- Neither module imports from the other. `pnpm check:tiers` continues to pass.
- Both modules have feature flags that can disable them at runtime without breaking the core.

## Parallelization

If two people are available, referral can ship alongside onboarding as long as the referral-landing contract (query-param shape, cookie name, attribution event payload) is stubbed in onboarding's spec first. Solo, ship sequentially; the cognitive overhead of keeping two extended modules in flight at once is rarely worth it for only two items.

## Sequencing risks

- **Referral before onboarding is tempting** because "attribution is the marketable feature." Don't. Without an onboarding flow that takes the referral token and routes accordingly, the referral module would need to own its own post-signup UX, which bleeds responsibility across modules and violates the single-owner rule.
- **Splitting onboarding across phases is tempting** because the wizard is large. Don't split across phases; split across PRs instead. The onboarding spec already enumerates stages (welcome, role-specific steps, completion); land them as separate PRs under the same module package.
