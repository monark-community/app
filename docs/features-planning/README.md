# Monark App ; features planning

Per-feature implementation specifications. Each doc is a standalone, hand-offable spec (goals, data
model, API surface, UI flows, dependencies, edge cases, out-of-scope).

Three kinds of doc live here:

- **[`proposed/`](proposed/)** ; the **live backlog**. Designed, not built. These stay editable.
- **[`shipped/`](shipped/)** ; specs that started in `proposed/` and landed. Kept as the historical
  record of what the feature was designed to be, and **not** edited afterwards ; the as-built truth
  lives in the module's `README.md`, per [CONTRIBUTING.md](../../CONTRIBUTING.md).
- **`phase-0/` … `phase-3/`** ; the original 2026 sequential roadmap, retained as history for the
  same reason. The platform outgrew the phase model: the shipped set is now **16 core + 8 extended**
  modules ([modules.manifest.ts](../../modules.manifest.ts)), and several shipped modules never had
  a phase spec at all.

> **Authoritative as-is reference**:
> [platform-overview](../technical-documentation/platform-overview/_index.md) supersedes any stale
> detail in a shipped spec here. A spec describes what was intended ; the module README and the
> technical documentation describe what exists.

## The integration program

Five phases of one program, approved 2026-09-07 with product decisions locked 2026-09-08. The specs
below transcribe that plan into the repo, re-verified against the code on 2026-09-10 ; the phase
letters are the plan's own. **Decisions marked locked in a spec are not to be re-opened** without
the operator saying so.

Driving complaint, in the operator's words: _"a lot of power under the hood, but features live in
silo."_

| Phase | Spec                                                            | What it settles                                                                                         | State                                                                 |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **A** | [access-control-console.md](proposed/access-control-console.md) | MonarkQL-scoped record RBAC, and where access is authored                                               | **engine shipped** (`2026-09-08`, PRs #64/#75/#83) ; console proposed |
| **B** | [views-system.md](proposed/views-system.md)                     | a real View entity (`type` + `config`), a sort input on `records.list`, saved vs. session state         | proposed ; blocks C3                                                  |
| **C** | [workspace-unification.md](proposed/workspace-unification.md)   | one core `ContentNode` tree, the `/workspace` section, kanban + calendar materialization                | proposed ; umbrella                                                   |
| **D** | [automation-model-refs.md](proposed/automation-model-refs.md)   | a reverse index of which models an automation touches ; closes a trigger-matching fail-open             | proposed ; independent                                                |
| **E** | [integrations-rework.md](proposed/integrations-rework.md)       | config variables, per-user credentials, the automation actor as a live principal, one integrations home | E.1 mostly shipped ; the rest proposed                                |

Sequencing, shortest path first (the plan's own):

```
E.1 docs               ── landed ; blocked nothing, unblocked everyone
A0  converge paths     ── shipped (#57)
A1  record scopes      ──┐
B   view entity + sort ──┼──> C2..C4  workspace tree + shell
C1  ContentNode        ──┘
                          C5 kanban materialize + write-back  ┐ parallel
                          C6 calendar range + write-back      ┘ with C2..C4
D, E.2, E.6            ── independent
E.4 automation actor   ──> E.3 per-user secrets ──> E.5 integrations home
```

**Record RBAC leads** because every later surface (a board view, a calendar view, a tree node, a
public form, an MCP tool) inherits whatever access model is in place ; and because the public API
and MCP are facades over the same tRPC procedures, scoping at that seam is the only place it is done
once.

## Other active tracks

| Track                     | Spec                                                                    | State                                                        |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Deploy pipeline**       | [deploy-pipeline-completion.md](proposed/deploy-pipeline-completion.md) | **mostly shipped** ; three gaps, the double-deploy one first |
| **Dev overlay flag tree** | [dev-overlay-flag-tree.md](proposed/dev-overlay-flag-tree.md)           | proposed ; small, self-contained                             |

Recently completed and closed out of this folder:

- **White-labelling** ; every Monark-specific string, asset and colour is configurable through
  `BRANDING` + env. See [white-label](../technical-documentation/white-label/_index.md) and
  [`@monark/branding`](../../packages/branding/README.md). A few cosmetic leftovers are tracked in
  [the backlog](../todo/backlog.md#white-label-gaps).
- **Social sign-in (OAuth)** ; GitHub, Google and Microsoft (Entra ID), plus linked-account
  management in `/account/security`. See
  [social-sign-in.md](../technical-documentation/social-sign-in.md).
- **Documentation platform** ; the user guide, each extended module's guide, and the technical
  documentation render at [docs.app.monark.io](https://docs.app.monark.io) from
  [monark-community/app-docs](https://github.com/monark-community/app-docs), synced by
  [notify-docs.yml](../../.github/workflows/notify-docs.yml) on every push to `develop` that touches
  them (plus a daily schedule, so a lapsed credential delays rather than breaks). This repo stays
  the source of truth for the prose. See
  ["Publishing the docs"](../technical-documentation/ci/_index.md).
- **Single-tenancy** ; multi-tenancy was removed rather than finished. See
  [multi-instance](../technical-documentation/multi-instance/_index.md) for the many-instances
  model that replaced it.

## Shipped specs

### Foundational (`phase-0/`)

- [`phase-0/modular-architecture.md`](phase-0/modular-architecture.md) ; the core/extended two-tier
  model (live: [architecture](../technical-documentation/architecture/_index.md) +
  [extensibility-contract](../technical-documentation/extensibility-contract/_index.md)).
- [`phase-0/project-scaffolding.md`](phase-0/project-scaffolding.md) ; stack + workspace layout.
- [`phase-0/scaffolding-status.md`](phase-0/scaffolding-status.md) ; the phase-0 landing record.

### Core modules (`phase-1/`)

| Spec                                                                                                                                                                                                                                                                | Live module                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`feature-flags`](phase-1/feature-flags.md)                                                                                                                                                                                                                         | [`@monark/feature-flags`](../../packages/feature-flags/README.md) |
| [`user-management`](phase-1/user-management.md)                                                                                                                                                                                                                     | [`@monark/users`](../../packages/users/README.md)                 |
| [`organization-management`](phase-1/organization-management.md)                                                                                                                                                                                                     | [`@monark/organizations`](../../packages/organizations/README.md) |
| [`rbac-system`](phase-1/rbac-system.md)                                                                                                                                                                                                                             | [`@monark/rbac`](../../packages/rbac/README.md)                   |
| [`auth-login-password`](phase-1/auth-login-password.md) · [`password-strength`](phase-1/auth-password-strength.md) · [`email-validation`](phase-1/auth-email-validation.md) · [`trusted-devices`](phase-1/auth-trusted-devices.md) · [`totp`](phase-1/auth-totp.md) | [`@monark/auth`](../../packages/auth/README.md)                   |
| [`notifications-system`](phase-1/notifications-system.md)                                                                                                                                                                                                           | [`@monark/notifications`](../../packages/notifications/README.md) |

### Later work (`phase-2/`, `phase-3/`)

| Spec                                                                                                                             | Live module                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`polymorphic-db`](phase-2/polymorphic-db.md) ; runtime Data Models, which replaced the hardcoded `Project` / `Industry` modules | [`@monark/data-models`](../../packages/data-models/README.md) + [`@monark/query`](../../packages/query/README.md)     |
| [`data-models-file-fields`](phase-3/data-models-file-fields.md) ; `FILE` / `ATTACHMENTS`                                         | [`@monark/files`](../../packages/files/README.md)                                                                     |
| [`data-models-visualizations`](phase-3/data-models-visualizations.md) ; verdict: keep Calendar / Kanban as tabled modules        | [`@monark/calendar`](../../packages/calendar/README.md) · [`@monark/kanban`](../../packages/kanban/README.md)         |
| [`public-api`](phase-3/public-api.md) ; v1 REST + OpenAPI                                                                        | [`@monark/public-api`](../../packages/public-api/README.md) + [`@monark/api-keys`](../../packages/api-keys/README.md) |
| [`public-api-service-accounts`](phase-3/public-api-service-accounts.md) ; v2 service accounts                                    | [`@monark/api-keys`](../../packages/api-keys/README.md)                                                               |

> `data-models-visualizations.md` is the one shipped spec still partly **live**. Its verdict (keep
> Calendar and Kanban as separate tabled modules, rather than dissolving them into Data Models) is
> the decision [views-system.md](proposed/views-system.md) reconfirmed on 2026-09-10, and its
> **Part B (kanban materialization) was never built and is still valid** ; Phase C5 is that work.
> Two of its stated blockers are now false, though (it cited "no range operators" and "schema
> fragments don't exist", both shipped since). Per the convention the spec stays unedited ; this
> note is where the correction lives.

### From `proposed/`, now shipped (`shipped/`)

- [`shipped/wiki.md`](shipped/wiki.md) ; nested-page wiki
  ([`@monark/wiki`](../../packages/wiki/README.md)).
- [`shipped/block-editor.md`](shipped/block-editor.md) ; BlockNote block editing, the `DOCUMENT`
  field type, wiki and kanban migrated.
- [`shipped/global-search.md`](shipped/global-search.md) ; the core search-source registry plus
  [`@monark/search`](../../packages/search/README.md).

### Shipped with no spec

Built directly ; see their READMEs: [`webhooks`](../../packages/webhooks/README.md),
[`secrets`](../../packages/secrets/README.md), [`automation`](../../packages/automation/README.md),
[`branding`](../../packages/branding/README.md), [`chat`](../../packages/chat/README.md),
[`achievements`](../../packages/achievements/README.md),
[`github`](../../packages/github/README.md), [`discord`](../../packages/discord/README.md),
[`telegram`](../../packages/telegram/README.md), [`twitter`](../../packages/twitter/README.md).

## Proposed ; not scheduled

Designed, no owner, no phase. These predate the current programs and are kept because the design
work is real, not because they are next.

- [`proposed/user-onboarding.md`](proposed/user-onboarding.md) ; role-specific onboarding wizard.
- [`proposed/referral-system.md`](proposed/referral-system.md) ; referral attribution.
- [`proposed/voting-system.md`](proposed/voting-system.md) ; decentralized governance proposals and
  ballots. Note that per-record voting **shipped** as part of public boards
  ([`DataRecordVote`](../../packages/db/prisma/base.prisma)) ; this spec is the governance system,
  which is a different and larger thing.
- [`proposed/contribution-estimation.md`](proposed/contribution-estimation.md) ; per-user
  contribution scoring.
- [`proposed/community-activity-feed.md`](proposed/community-activity-feed.md) ; public profiles,
  posts, comments, reactions.
- [`proposed/network-trust-score.md`](proposed/network-trust-score.md) ; invite tree, delegation,
  trust ladder.
- [`proposed/social-automation.md`](proposed/social-automation.md) ; event-driven social posting.
  Its token storage now rides [`@monark/secrets`](../../packages/secrets/README.md), and the
  [integrations rework](proposed/integrations-rework.md) would supersede most of its plumbing.

Sequencing notes for the acquisition (onboarding, referral) and engagement (voting, contribution)
tracks live in [`phase-2/phase-planning.md`](phase-2/phase-planning.md) and
[`phase-3/phase-planning.md`](phase-3/phase-planning.md).

## Product context

Monark App began as the central hub for five user types: **Admin** (executive, invite-only),
**Moderator** (elected community), **Developer** (self-onboarding), **Student** (short-term,
guided), **Ambassador** (community-facing). Founding executive priorities were contribution
quantification, decentralized voting, referral-system integration, automated marketing content, and
living-data centralization. Several became the proposed specs above ; "living-data centralization"
is what the shipped Data Models engine delivers, and the workspace program is its second act.

## How to read a feature doc

Every spec follows the same shape so reviewers can scan across them: **Context · Goals · Non-goals ·
User stories · Data model · API surface · UI flows · Dependencies · Integration points · Edge cases
and risks · Success metrics · Implementation notes · Out of scope**.

## Conventions

- **Tech stack**: pnpm workspace rooted at `app/`. Next.js 15 App Router in `services/web`,
  Express 5 + tRPC v11 in `services/api`, Prisma against Supabase Postgres in `packages/db`, shadcn
  components via the `@monark` registry into `packages/components`. Full details in
  [architecture](../technical-documentation/architecture/_index.md).
- **Module layout**: one package per module with `/server`, `/client`, `/contracts` exports ; the
  boundary is enforced by `package.json#exports` and `pnpm check:tiers`. See
  [extensibility-contract](../technical-documentation/extensibility-contract/_index.md).
- **Prose style**: `;` rather than an em-dash to join clauses, per [CLAUDE.md](../../CLAUDE.md).
