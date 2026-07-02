# Codebase review — 2026-07-01

A five-dimension review of the Monark App monorepo, conducted against the working tree (including the ~114 uncommitted files). Each report stands alone ; this page is the executive synthesis and the cross-cutting picture.

## The reports

| Report | What it covers | Worst finding |
|---|---|---|
| [security.md](security.md) | auth, authz, tenancy, SSRF, secrets, XSS | **C1** — unauthenticated feature-flag override (remote security-control bypass) |
| [performance.md](performance.md) | request path, DB indexes, frontend bundle/cache | **RP-H2 + FE-H3** — per-request Supabase auth + a 4-hop authed-layout waterfall |
| [maintainability.md](maintainability.md) | duplication, abstraction gaps, type safety, tests | **M-C1** — calendar unmanifested ; the tree fails its own CI codegen gate |
| [ux.md](ux.md) | loading/error/empty states, forms, i18n, a11y | **E-1 / E-2** — no error boundaries ; failed lists render as "empty" |
| [product.md](product.md) | identity, feature completeness, gaps, telemetry | product identity undecided ; ~7 weeks of work uncommitted |
| [collaboration.md](collaboration.md) | **systemic changes to how the team works** | — |

## The one-paragraph picture

This is an unusually well-engineered platform kernel with a **quality-assurance gap that its own tooling was built to prevent but isn't yet closing**. The architecture is genuinely strong: a real shared-patterns library used by every screen, a single typed error model, HMAC-signed webhook outbox with backoff, AES-encrypted TOTP secrets, perfect 1262-key i18n parity, testcontainer integration suites, and a codegen-drift CI gate. Yet the review surfaced a remotely-exploitable unauthenticated endpoint, a cross-tenant IDOR class, no error boundaries anywhere, and a module (calendar) that is simultaneously the newest, largest, least-tested, most type-unsafe, *and* not registered in the manifest — meaning the working tree currently fails CI on arrival. **The standards exist and are excellent ; they are applied inconsistently, and the newest code consistently escapes them.** Every dimension's worst findings cluster in the same two places: the calendar module and the seams between modules (the auth/org preamble, cross-tenant admin, the event bus). That is a process signal, not four unrelated bugs.

## Cross-cutting themes (the same root causes, seen five ways)

**1. The calendar module is the review's center of gravity.** It is the #1 finding or a top-3 finding in *four of five* reports: unmanifested and CI-breaking (maintainability M-C1), two cross-tenant IDOR mutations (security H2/H3), the three largest files in the repo with ~25 of the ~70 banned non-null assertions and 8 eslint-disables (maintainability), no loading/error/empty states and zero keyboard accessibility (ux L-1/E-3/A-1/F-2), and an N+1 reminder sweep (performance RP-M4). One module, built after the standards were written, that adopted almost none of them. It needs a dedicated conformance pass before anything is built on top of it.

**2. Missing shared abstractions cause the security bugs, not just the duplication.** There is no `protectedProcedure`/`orgScopedProcedure`, so the auth+org+permission preamble is hand-copied ~40 times (maintainability M-D1). Where a copy is incomplete, you get exactly the security findings: calendar's `events.delete`/`events.update` skip the org-scope check (security H2/H3), and the feature-flags router is `publicProcedure` with no check at all (security C1). The fix for the duplication *is* the structural fix for the vulnerability class — one refactor closes both.

**3. Error handling is absent as a system, not as scattered omissions.** No `error.tsx`, no list `errorState`, ~40 mutations that pipe errors to toasts and ~6 that swallow them silently, and server-side `.catch(() => [])` that turns failures into empty UIs (ux E-1/E-2/E-3/F-4). The happy path is polished everywhere ; the unhappy path was never designed. This is what ships when there's no checklist item and no reviewer asking "what does this look like when the query fails?"

**4. The request path re-does expensive work on every hop.** Per-request Supabase auth verification (performance RP-H2), an uncached RBAC guard (RP-M1), `myPermissions` fanning out 2×N queries (RP-H1), and an authed layout that chains ~5 auth verifications across 4 sequential hops (FE-H3) — plus SMTP sent synchronously inside mutations (RP-H3). None of these is wrong logic ; all are "no caching layer, no async boundary" decisions that compound.

**5. The platform is a full cycle ahead of the product, and nothing measures usage.** Roughly 12k lines of platform plumbing vs ~2.5k of user-facing features, no telemetry of any kind, and the golden path dead-ends on a placeholder home page (product). Meanwhile the newest investment (the fields toolkit, the polymorphic-DB plan) would rewrite features that have never met a user.

## What is genuinely excellent (keep and defend)

- The `components/patterns/` library and its near-total adoption ; zero hand-rolled tables.
- The single `AppError` hierarchy + one translation middleware ; one `TRPCError` in the whole tree.
- Secrets-at-rest hygiene (AES-GCM TOTP, hashed webhook secrets and device cookies, constant-time compares).
- The webhook outbox (at-least-once, idempotency keys, backoff, auto-disable) and the correctly-indexed hot paths (notification dedupe, delivery poll, reminder sweep).
- i18n key parity (1262/1262) and the codegen → manifest → CI-check discipline.
- The auth/setup flows and the account-section skeletons.

The gap is not capability. It is consistency and verification — which is exactly what [collaboration.md](collaboration.md) addresses.

## If you do only five things

1. **Fix security C1** (unauthenticated flag override) — it is remotely exploitable right now.
2. **Fix maintainability M-C1** (manifest + `pnpm gen`) — the tree fails its own CI gate; land it so main is green.
3. **Commit and tag the working tree** (product) — ~7 weeks of work lives on one machine.
4. **Extract `orgScopedProcedure`** (maintainability M-D1 / security H2-H4) — one refactor that structurally prevents the IDOR class.
5. **Add error boundaries + a DataTable `errorState`** (ux E-1/E-2) — the largest single UX-correctness gap.
