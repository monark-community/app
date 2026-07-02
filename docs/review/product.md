# Product review

Date: 2026-07-01 ; scope: working tree (includes the ~114 uncommitted files) ; method: full read of README, CHANGELOG, docs/features-planning, docs/user-guide, docs/todo/backlog.md, modules.manifest.ts, package READMEs, and the services/web route surface.

## Verdict in one paragraph

Monark App is two products wearing one repo. As stated in [README.md](../../README.md) it is "the central hub for the Monark Web3 community" ; as implemented it is a very polished single-tenant SaaS platform kernel (auth + TOTP + trusted devices, RBAC with custom roles, feature flags, bilingual notifications, HMAC-signed webhooks, white-label branding, admin console) plus three early vertical features (Projects, Industries, Calendar). Of the five stated executive priorities, only "centralization of living project data" has any code. The platform is roughly a full product-cycle ahead of the product, and the newest work (the fields toolkit, the polymorphic-DB plan) hints at a third identity forming: a generic data-platform. The identity needs to be decided and written down.

## 1. Identity: stated vs implemented

- **Stated** ([README.md](../../README.md)): a Web3 community hub serving five roles (Admin, Moderator, Developer, Student, Ambassador), with executive priorities of contribution quantification, decentralized voting, referral integration, automated marketing, and living project data.
- **Implemented**: a SaaS platform kernel. None of `@monark/voting`, `@monark/contributions`, `@monark/referral`, `@monark/onboarding` exist in `packages/` ; voting, contribution estimation, referrals, and marketing automation are planned-only ([docs/features-planning/phase-2](../features-planning/phase-2), [phase-3](../features-planning/phase-3), [social-automation.md](../features-planning/social-automation.md)).
- **Semi-official kernel identity**: [phase-0/project-scaffolding.md](../features-planning/phase-0/project-scaffolding.md) says patterns are "portable to Scintillar verbatim", `packages/branding` exists solely for white-label retargeting, and the user guide calls the product "Monark Core" ([docs/user-guide/\_index.md](../user-guide/_index.md)). No doc ever declares the pivot ; the README still sells the community hub.
- **Third identity forming**: [phase-2/polymorphic-db.md](../features-planning/phase-2/polymorphic-db.md) proposes Notion-style runtime data models, and the `@/components/fields` toolkit shipped 2026-07-01 was "built for the coming polymorphic Data Model" (CHANGELOG). That is a data-platform product, not a community hub.

## 2. Feature inventory

| Module / surface                                                               | Tier                       | Status                                   | Evidence                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (password, TOTP, trusted devices, revoke-by-email)                        | core                       | Complete                                 | [packages/auth/README.md](../../packages/auth/README.md) ; `(anon)` routes ; CHANGELOG 2026-05-29                                                                                              |
| Users + account section                                                        | core                       | Complete                                 | [packages/users/README.md](../../packages/users/README.md) ; `(authed)/account/*` incl. grace-period deletion                                                                                  |
| Organizations                                                                  | core                       | Partial                                  | Read surface + admin invites shipped ; no self-serve org creation, no org switcher, no `setActiveOrg` write path ([backlog.md](../todo/backlog.md) "Multi-tenant readiness") ; README stale    |
| RBAC (custom roles, matrix, SYSADMIN)                                          | core                       | Complete                                 | [packages/rbac/README.md](../../packages/rbac/README.md) ; `/admin/rbac`                                                                                                                       |
| Feature flags + overrides                                                      | core                       | Complete                                 | [packages/feature-flags/README.md](../../packages/feature-flags/README.md) ; `/admin/feature-flags`                                                                                            |
| Notifications (email + in-app, en/fr)                                          | core                       | Complete, one live defect                | Core `router.ts` hardcodes `case "calendar.event.reminder"`, breaking standalone typecheck ; core→extended coupling                                                                            |
| Webhooks (outbox, HMAC, retries, delivery log UI)                              | core                       | Complete                                 | [packages/webhooks/README.md](../../packages/webhooks/README.md) ; delivery detail pages                                                                                                       |
| Branding / white-label                                                         | core                       | Complete, small gaps                     | Leftover `monark.io` strings ([backlog.md](../todo/backlog.md) "White-label gaps")                                                                                                             |
| Admin console                                                                  | core                       | Complete                                 | Unified DataTable/panel UX (CHANGELOG 2026-07-01) ; no dashboard index                                                                                                                         |
| Projects                                                                       | extended                   | Partial-complete                         | Full CRUD + archive/restore + inline edit ; **no README**, placeholder client barrel                                                                                                           |
| Industries                                                                     | extended                   | Complete                                 | The CLAUDE.md reference implementation                                                                                                                                                         |
| Calendar                                                                       | extended, **unregistered** | Partial-complete                         | Day/week/month views, per-calendar RBAC, reminders cron ; **missing from [modules.manifest.ts](../../modules.manifest.ts)** despite being wired into server.ts ; README lags shipped reminders |
| Home / dashboard                                                               | —                          | Stub                                     | `(authed)/page.tsx` renders a placeholder welcome block                                                                                                                                        |
| Onboarding, referrals, voting, contributions, activity feed, social automation | extended                   | Planned-only                             | features-planning docs ; no packages                                                                                                                                                           |
| Polymorphic data models                                                        | core                       | Planned-only (client groundwork shipped) | fields toolkit + `/dev/fields` gallery                                                                                                                                                         |
| `@monark/shared`                                                               | —                          | Stub                                     | README says "Empty today"                                                                                                                                                                      |

### The golden path dead-ends

Sign up → confirm → sign in → TOTP → reset is fully self-service and polished, including invite auto-acceptance on signup. But: **create org** dead-ends (the org is bootstrapped once at deploy from `INITIAL_ORG_*` env vars via `/setup` ; a user cannot create a workspace) ; invited users land on the **placeholder home page** and must discover Projects/Industries/Calendar through the hamburger drawer ; there is no onboarding, no dashboard, no prompt toward any job-to-be-done. The golden path ends on a welcome sign.

## 3. Platform vs product balance

Package source LOC: platform ≈ 11,960 (auth 2,449 ; notifications 2,456 ; webhooks 1,806 ; organizations 1,681 ; rbac 1,604 ; users 846 ; feature-flags 602 ; common/branding/db 518) vs product ≈ 2,500 (projects 999 + calendar ~1,500). Of ~140 CHANGELOG entries since 2026-04-21, the overwhelming majority are platform/CI/test/UX-pattern work ; the first product feature (Calendar day view) appears 2026-06-14, eight weeks in. Recent work (ColorInput unification, calm table chrome, scrollbar-gutter, fields toolkit) keeps investing in _how_ screens are built rather than _what_ the product does — a gold-plating trajectory for a pre-user app.

## 4. Gaps a real customer would hit (ranked)

1. **No billing/subscription** — zero stripe/checkout/invoice code anywhere. Critical if the SaaS-kernel identity wins ; N/A if the hub identity wins. The ambiguity itself is the problem.
2. **No self-serve org creation / multi-tenant path** — every deploy is one org via env vars.
3. **No audit log UI** — [user-guide/admin.md](../user-guide/admin.md) punts to "the operator's logging stack", yet no Sentry/ELK is wired either.
4. **No data export/import** — no CSV/JSON export anywhere ; GDPR portability requires raw DB access.
5. **No API keys / public API** — webhooks are outbound-only ; the only bearer auths are Supabase user tokens and `CRON_SECRET`.
6. **No global search / command palette** — cmdk is installed but only used in comboboxes.
7. **Offboarding half-done** — user grace-period deletion exists ; org deletion does not ; admin-initiated email change punted ([backlog.md](../todo/backlog.md)).
8. **Mobile** — recently and seriously addressed ; least concerning gap.

## 5. Backlog and planning-docs quality

[docs/todo/backlog.md](../todo/backlog.md) is high quality but unprioritized: dated, root-caused, file-linked entries that demonstrably stay in sync with the code — and 100% platform items. Not a single product feature appears in it, so the actionable list and the product vision never meet. Staleness found: the "deletion cron has no scheduler" item was actually closed by `render.yaml` on 2026-05-08 but is not struck through ; [features-planning/README.md](../features-planning/README.md) has a broken link (`phase-1/auth-aesthetics.md`) and omits the three newer phase-2 docs and `social-automation.md` from its index ; `network-trust-score.md` silently supersedes non-goals in "shipped" phase-1 specs.

## 6. Onboarding and docs

The user guide is complete and unusually honest for what it covers (account, admin, navigation — including a "What admins can't do today" section). A new **operator** would succeed (`pnpm bootstrap`, deploy-checklist, break-glass `pnpm sysadmin grant`). But the guide covers **zero product features**: no page for Projects, Industries, or Calendar — the three primary-nav entries. `packages/projects` has no README, violating the repo's own working agreement ; `packages/calendar/README.md` lists reminders as "Deferred" while the reminder sweep is live.

## 7. Telemetry

None. No analytics or error-tracking SDK in any package.json (PostHog/Plausible/Mixpanel/Segment/GA/Sentry all absent ; the Sentry/ClickHouse docs are evaluation notes only). Observability is pino logs + `/health`. Domain events exist for everything but nothing aggregates them. **The team currently has no way to know whether Calendar or Projects is used at all** — notable given phase-3's contribution-estimation feature would depend on activity signals.

## 8. Risks

- **Bus factor = 1**: 44 of 52 commits by one author.
- **~7 weeks of work uncommitted**: last commit 2026-05-10, CHANGELOG entries through 2026-07-01, 114 changed files (43 untracked). The calendar evolution, the patterns library, and the fields toolkit exist only in one working tree on one machine. This is the single most acute operational risk found.
- **Boundary erosion**: calendar missing from the manifest while wired into server.ts ; core notifications hardcoding a calendar kind. The two-tier contract the repo enforces by CI is already leaking at its edges.
- **Scope creep**: drag-reorderable resizable columns, screenshot harness, calm-chrome hover polish, a full descriptor-driven fields toolkit — all before a single release has been cut.

## Recommendations

1. **Commit and release now.** Land the 114-file working tree as reviewed commits, cut `v0.1.0`. Risk-reduction with zero product cost.
2. **Write the identity down.** One ADR: (a) white-label SaaS kernel with Monark as first tenant, or (b) the Monark community hub. Rewrite the README to match ; archive whichever phase-2/3 specs die with the decision.
3. **Finish the golden path before any new module.** Replace the stub home with a real dashboard (upcoming events, recent projects, admin setup checklist). Days of work, more user impact than the entire fields toolkit.
4. **Regularize Calendar**: add it to [modules.manifest.ts](../../modules.manifest.ts), move the reminder registration out of core hardcoding into the module's own `register*` surface, update its README, fix the soft-delete wording.
5. **Ship a minimal audit-log screen** — a read-only `/admin/audit` DataTable over the webhook outbox, which already persists every emit.
6. **Add basic telemetry** before deciding on polymorphic-DB. "Does anyone open Calendar?" must be answerable.
7. **Defer polymorphic-db** — it rewrites two features that have never met a user ; its client half is already built and reusable regardless.
8. **Prioritize the backlog and merge in product items** (P0/P1/P2 markers ; add projects README, calendar user-guide page, home dashboard).
9. **Close small doc debts**: projects README, user-guide pages for the three product features, stale `primary-nav.ts` comment, broken planning link.
10. **Decide tenancy explicitly** ; if single-tenant-per-deploy is the model, document it as a feature and stop carrying multi-tenant scaffolding ambiguity.
