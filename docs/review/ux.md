# UX review

Date: 2026-07-01 ; scope: working tree (uncommitted changes included) ; method: code-level review of routes, components, patterns, and i18n catalogs, verified at file:line. Severity = user impact × surface prominence.

Headline: the pattern architecture (DataTable / FilterBar / TableDetailLayout / DirtyFormBar), i18n catalog hygiene (1262-key perfect parity), account-section loading states, and the auth/setup flows are genuinely excellent — the codebase largely enforces its own standards structurally. The debt is concentrated in **three places**: error handling (systemic — no error boundaries, and list failures render as empty states), the **calendar module** (the outlier on loading, feedback, confirmation, and keyboard access), and a handful of destructive-action and feedback gaps.

## 1. Loading states

Baseline done well: the route-level `(authed)/loading.tsx` keeps the AppBar during navigation ; all four `/account/*` sub-routes ship exceptionally layout-accurate `loading.tsx` files (the danger tab even tints the skeleton `bg-destructive/20`) ; `DataTable` has built-in per-column skeleton rows and every list screen passes `isLoading`. The deleted `account/loading.tsx` is **not a regression** — `/account` now redirects to `/account/profile` and each tab has its own skeleton.

- **L-1 (High). Calendar grid renders empty while events load ; events "pop in" with no loading or error indication.** [calendar/week-view.tsx](../../services/web/src/app/(authed)/calendar/week-view.tsx):276-280 feeds `eventsQuery.data ?? []` straight to the grid — no `isLoading`, no skeleton, no error branch (same in day/month). The user sees a blank week and believes they have no events ; on failure the calendar shows nothing forever. Fix: skeleton event blocks (or `aria-busy` shimmer) while loading ; error banner with retry on `isError`.
- **L-2 (Medium). The generic `(authed)/loading.tsx` is layout-wrong for full-bleed routes.** [loading.tsx](../../services/web/src/app/(authed)/loading.tsx):15 renders a centered `max-w-2xl` block, but `/calendar`, `/projects`, `/industries`, and `/admin/*` are wide table/shell layouts — so navigation paints a narrow centered skeleton then snaps to a full-width table, exactly the layout shift the standard exists to prevent. Only `/account/*` has segment-level loading. Fix: per-segment `loading.tsx` for admin, calendar, projects, industries.
- **L-3 (Medium). Notifications bell drawer uses a "Loading…" string, not a skeleton** — [notifications-bell.tsx](../../services/web/src/components/notifications-bell.tsx):212-215, a direct violation of the house rule. Fix: 3-4 skeleton rows.
- **L-4 (Low).** Setup page spinners are a deliberate staged boot animation with reduced-motion handling, not a data placeholder. No action.

## 2. Error states

Done well: detail surfaces handle load errors (user-detail, organization-detail, role-editor, projects panel) ; the revoke-device form is a model error state machine with retry that distinguishes network failure from an expired token.

- **E-1 (High). No `error.tsx` anywhere ; a render/server error yields Next's unstyled default crash page.** Zero `error.tsx` or `global-error.tsx` in the tree (only `not-found.tsx`). Any thrown error in an RSC or client render (e.g. the tRPC calls in `calendar/page.tsx`, `admin/layout.tsx`) drops the user on the raw Next error screen — no brand chrome, no i18n, no recovery. Fix: `(authed)/error.tsx` (AppBar + translated message + "Try again" via `reset()`), plus a root `global-error.tsx`.
- **E-2 (High). List screens have no `isError` branch, so a failed query displays the designed *empty* state ("No users yet").** Confirmed in users-list, organizations-list, roles-manager, webhooks-manager, deliveries-list, projects-list, industries-list: `isLoading` false + `data ?? []` empty ⇒ DataTable renders `emptyState`, even when the request failed. An operator with a flaky connection reads "No organizations yet" and may act on false information, with no retry. Fix: add an `errorState` slot to `DataTable` (sibling of `emptyState`) with a translated message + retry wired to `query.refetch()` ; thread `isError` from each caller.
- **E-3 (Medium). Server-side fetch failures on `/calendar` are silently swallowed into an empty UI** — [calendar/page.tsx](../../services/web/src/app/(authed)/calendar/page.tsx):20-22 does `.catch(() => [])` on `calendars.list` and `myPermissions`, so a transient failure renders zero calendars and zero permissions (manage/delete affordances vanish) with no signal. Fix: pass an `initialLoadFailed` flag into `CalendarShell` and show a banner.
- **E-4. Empty states — mostly good, two low gaps.** Every DataTable caller passes distinct `empty` vs `emptySearch`/`emptyFiltered` copy ; trusted devices, the bell drawer, and the nav drawer all have designed empty branches. Gaps (Low): empty states are text-only with no CTA (the CTA sits in the FilterBar above), and the empty cell has no illustration/hierarchy distinguishing "empty" from "filtered to nothing".

## 3. Forms, dirty state, destructive actions

Done well: the auth stack (signin/signup/forgot/reset/totp/revoke-device) is consistently excellent — inline error codes, pending labels, gated submits, password-manager `autoComplete`. The six `DirtyFormBar` adopters implement the full contract (baseline resync, Cancel=revert, `containment="container"` in panels, delete in `DangerCard`). Typed-email confirmation for both self-service and admin hard-delete.

- **F-1 (High). The webhook signing secret is unobtainable after create** — the promised copy-once banner doesn't exist. [webhook-editor.tsx](../../services/web/src/app/(authed)/admin/webhooks/webhook-editor.tsx):135-144 stores `revealedSecret` on create success then immediately navigates/remounts, unmounting the state ; `revealedSecret` renders only inside the rotate dialog, which never opens on create. The doc comment at :50-54 promises the banner. The primary create flow cannot yield the signing secret ; the only recovery is an immediate rotation — signature-verification setup is broken. Fix: show the reveal dialog on create success ; navigate only after acknowledgement.
- **F-2 (High). Calendar deletion: no confirm, no pending state, no feedback, unhandled rejection** — [calendar-manage-dialog.tsx](../../services/web/src/app/(authed)/calendar/calendar-manage-dialog.tsx):91-97 fires `onDelete(id)` on dialog close ; the view just `await deleteCalendar.mutateAsync` and a rejection is silent. One click destroys a calendar and its events. Fix: `ConfirmDialog` gate, toasts, disable-while-pending.
- **F-3 (High). Native `window.confirm` for destructive deletes** in [role-editor.tsx](../../services/web/src/app/(authed)/admin/rbac/role-editor.tsx):304-314, [webhook-editor.tsx](../../services/web/src/app/(authed)/admin/webhooks/webhook-editor.tsx):312-317, and calendar new-event discard — inconsistent even within the same file (rotate uses a proper dialog), unstylable, poor mobile/a11y. Fix: `ConfirmDialog` + `isPending`.
- **F-4 (Medium). Cluster of silent mutation failures (no `onError`)** — profile-section avatar/banner remove, notifications-section, admin-notifications, trusted-devices-section (dialog already closed before failure lands), and every bell action (markRead/markUnread/dismiss/markAllRead). Fix: `onError → toast.error` everywhere ; else-branches on tagged results.
- **F-5 (Medium). Admin profile form save-on-blur silently drops invalid input and diverges from the house pattern** — [admin-profile-form.tsx](../../services/web/src/app/(authed)/admin/users/[id]/admin-profile-form.tsx):97-118 returns without saving or erroring on invalid length, per-field toast on each blur, while its self-service twin uses `DirtyFormBar`. Two profile editors, two behaviors. Fix: adopt the batch-save `DirtyFormBar` shape with inline errors.
- **F-6 (Medium). Validation-by-toast instead of inline field errors on all DirtyFormBar editors** — organization-detail, role-editor, webhook-editor, project-form show a generic `saveError` toast for a too-long name (doesn't say what's wrong), the toast vanishes, the field is never marked. react-hook-form/zod exists only in the `@/components/fields` dev sandbox — every production form is hand-rolled `useState`. Fix: per-field inline error state (already proven in signin-form).
- **F-7 (Medium). CalendarManageDialog save: no submitting state, silent validation, swallowed errors** ; double-submit possible.
- **F-8 (Low).** `danger-zone-section` cancel button never disabled (discards `isPending`) ; industry-edit-form silent no-op on empty name + baseline pinned to props (bar can stay up after save) ; literal `"…"` pending labels ; one-click role-revoke chip with no confirm ; `FormActionsFooter` used outside its sanctioned AutoForm home.

## 4. i18n

Done well: en/fr are in **perfect parity — 1262/1262 keys, zero drift**, and locale plumbing is complete (`NEXT_LOCALE` cookie + profile persistence, switcher in Account → Profile, `html lang` per locale, `[locale, "en"]` Intl fallback idiom, an `Intl.RelativeTimeFormat` helper).

- **I-1 (Medium). Hardcoded English `"Something went wrong"` fallback in the calendar event form** — [new-event-popover.tsx](../../services/web/src/app/(authed)/calendar/new-event-popover.tsx):477,493. French users see English on create/update/delete failure.
- **I-2 (Medium). Hardcoded English `aria-label`s on chrome + color picker** — app-bar-breadcrumb ("Current section", "Breadcrumb"), page-layout, `ui/color-picker.tsx` (5 labels + interpolated `aria-valuetext`), and the sr-only "Close" in `ui/sheet.tsx`/`ui/dialog.tsx`. French screen-reader users hear English. Fix: `a11y.*` keys.
- **I-3 (Medium). Webhook delivery timestamps use browser locale, not app locale** — deliveries-list and delivery-detail use bare `toLocaleString()`. Fix: `useLocale()` + `toLocaleString([locale, "en"], …)`.
- **I-4 (Medium). Fields toolkit date picker always English** — [date-field.tsx](../../services/web/src/components/fields/inputs/date-field.tsx):91-107 passes no `locale` to `<Calendar>`.
- **I-5 (Low).** Browser-locale number/date cells in `cells.tsx` ; projects-list re-implements relative time without locale (duplicate of `format-time.ts`) ; industries-list browser-locale date ; hardcoded `placeholder="Fintech"` ; systemic surfacing of raw English `err.message` inside translated toasts — fix architecturally by mapping tRPC error codes to translated messages.

## 5. Accessibility

Done well: icon-only buttons consistently carry translated `aria-label`/`sr-only` (PanelHeaderBar, FilterMenu, DataTable row-actions and open-panel, hamburger/launcher) ; `aria-expanded`/`aria-current` used correctly ; all Radix Dialog/Sheet get focus trap + Escape ; every `SheetContent` has a `SheetTitle` ; sortable headers are real buttons ; column drag has a `KeyboardSensor` ; trusted-devices skeleton sets `aria-busy` ; setup respects `prefers-reduced-motion`.

- **A-1 (High). The calendar grid is entirely pointer-driven — no keyboard path, no ARIA.** [week-view.tsx](../../services/web/src/app/(authed)/calendar/week-view.tsx) has zero `role=`, `tabIndex`, `onKeyDown`, or `aria-label` on grid/event elements ; drag-to-create/move/resize are mouse/touch-only (day/month identical). Keyboard and AT users cannot create, select, or move events — the flagship extended-module surface is inaccessible. Fix (incremental): focusable event chips that open the popover on Enter ; an explicit "New event" button as the keyboard alternative to drag-create ; `aria-label` day cells with the date.
- **A-2 (Medium). DataTable header conflates drag + sort on one button, and sets no `aria-sort`** — [data-table.tsx](../../services/web/src/components/patterns/data-table/data-table.tsx):509-517 spreads dnd-kit drag listeners (which claim Enter/Space via KeyboardSensor) and the sort `onClick` on the same button, so keyboard activation starts a drag instead of sorting ; the chevrons are `aria-hidden` with no text equivalent. Fix: separate the drag handle from the sort button (or gate drag to a modifier) ; set `aria-sort` on the active header.
- **A-3 (Medium). Column resize handle is mouse/touch-only** — no keyboard/ARIA ; the layout-reset menu partially compensates.
- **A-4 (Medium). Bell drawer fake tablist** — `role="tablist"`/`role="tab"` without arrow-key navigation or `tabpanel` association ; announces semantics it doesn't implement.
- **A-5 (Low).** Sheet/Dialog hardcoded English "Close" (see I-2) ; deliveries `lastError` is red text only (acceptable — the status badge carries text) ; no skip-to-content link ; skeletons other than trusted-devices don't set `aria-busy`.

## 6. Consistency, navigation, titles

Done well: pattern adoption is near-total — every list screen uses `DataTable` + `storageKey` + translated `labels`, `FilterBar`/`FilterBarSearch`, `TableDetailLayout` + `useDetailPanelRoute` with `[id]` full pages as escape hatches. No hand-rolled tables. Nav is coherent: `PRIMARY_NAV` matches real routes ; the admin pin is RBAC-gated client-side and server-side (+ TOTP enforcement redirect) ; `/admin` and `/account` redirect to their first surface.

- **C-1 (Medium). Every page shares one generic document title** — only the root layout exports metadata ; zero `generateMetadata` in any page. Browser tabs, history, bookmarks, and screen-reader window titles all read the bare app name. Fix: per-page `generateMetadata` using the i18n title keys that already exist for `PageHeader`s.
- **C-2 (Medium). `/admin/feature-flags` doesn't exist despite being a documented core surface** — CLAUDE.md references it, but the route tree has no such directory and `ADMIN_TABS` lists only organizations/users/rbac/webhooks. Flags are only visible in the dev overlay. Operators have no production UI to flip flags. Fix: ship the tab (registry read + override CRUD gated by an rbac permission) or correct the docs.
- **C-3 (Low).** Org-scope pickers are loose `Select`s in Cards above the FilterBar (roles-manager, webhooks-manager) — the only place a bare Select steers a list. A `FilterMenu` entry or a documented "scope picker" pattern would close the loop.
- **C-4 (Low). Mobile** handling is genuinely thorough (`useIsMobile` drives full-screen Sheets with `100dvh`, FilterMenu modal, inline-edit disabled on touch). Residual: wide DataTables rely on horizontal scroll (usable but cramped) ; the calendar week view on a phone looks untested (fixed hour grid, no mobile branch).

## 7. Feedback

118 `toast` calls across 27 files ; admin CRUD is covered on success and error. `RouteProgress` gives navigation feedback (gap: programmatic `router.push` never triggers it, now that danger-zone and delete-account redirect programmatically — Low). Zero optimistic updates anywhere (correctness-safe, but the bell mark-read and preference toggles visibly lag the click — Low). Zero-toast zones are the calendar (F-2/F-7) and the silent-failure cluster (F-4). Bell UX is otherwise solid ; `dismiss` is permanent with no undo (Low) ; the doc comment says 60s polling but the constant is 15s (nit — see performance FE-M3).

## 8. Onboarding / first-run

`setup/` is a polished operator flow (staggered boot checklist, self-healing retry, stuck-state guidance, auto-forward, reduced-motion, fully i18n'd). The invite flow validates client-side, toasts, invalidates, and shows invites as first-class rows with revoke. Nudges exist (recovery-code reminder, admin TOTP banner).

- **O-1 (Low). The authed home page is an explicit placeholder** — [(authed)/page.tsx](../../services/web/src/app/(authed)/page.tsx):14-18 is logo + welcome heading only. No getting-started content, activity, or links to the three nav modules. The weakest first-run moment for an invited end-user (they land near-empty and must discover the hamburger). See also the Product report.

## Inventory — route coverage

| Route / screen | Loading | Error | Empty | Shared patterns |
|---|---|---|---|---|
| `(anon)` signin/signup/forgot/totp | pending labels ✔ (static forms) | inline error codes ✔ | N/A | auth layout |
| `auth/reset`, `revoke-device` | pending labels ✔ | state machine + retry ✔ | N/A | — |
| `setup` | staged checklist ✔ | stuck-state guidance ✔ | N/A | — |
| `/` (authed home) | `loading.tsx` ✔ | **no error.tsx** | placeholder page itself | — |
| `/account/*` (×4) | dedicated loading.tsx ×4 ✔ | **no error.tsx** ; silent mutations (F-4) | trusted devices ✔ | tabs, DangerCard, DirtyFormBar ✔ |
| `/admin/organizations` (+`[id]`) | DataTable skeletons ✔ ; generic fallback (L-2) | detail ✔ / **list E-2** | empty + emptySearch ✔ | full house pattern ✔ |
| `/admin/users` (+`[id]`) | DataTable skeletons ✔ | detail ✔ / **list E-2** | empty + emptySearch ✔ | full pattern ✔ (invite rows merged) |
| `/admin/rbac` | skeletons ✔ | editor ✔ / **list E-2** | empty + emptySearch ✔ | loose org Select (C-3) ; `window.confirm` (F-3) |
| `/admin/webhooks` (+deliveries) | skeletons ✔ | editor ✔, retry ✔ / **lists E-2** | empty ✔ | secret-loss (F-1) ; `window.confirm` (F-3) ; browser-locale dates (I-3) |
| `/projects` (+`[id]`) | DataTable + panel skeletons ✔ | panel ✔ / **list E-2** | empty + emptyFiltered ✔ | reference implementation ✔ |
| `/industries` (+`[id]`) | DataTable + panel skeletons ✔ | **list E-2** | empty ✔ | reference implementation ✔ |
| `/calendar` | **none — grid pops in (L-1)** | **none ; SSR swallowed (E-3) ; silent (F-2/F-7)** | blank grid (ambiguous) | **weakest surface** ; no keyboard a11y (A-1) |
| Notifications bell | **"Loading…" text (L-3)** | **silent (F-4)** | designed empty ✔ | fake tablist (A-4) |
| `/admin/feature-flags` | — | — | — | **route missing (C-2)** |

## Top priorities

1. **E-1 + E-2** — error boundaries and list `errorState` ; today every failure path either crashes to the default Next screen or lies ("No items yet").
2. **F-1** — webhook secret unobtainable after create (functional break in a security-critical flow).
3. **L-1 / F-2 / A-1** — the calendar is the outlier on every axis (loading, feedback, confirmation, keyboard) ; it needs a conformance pass to the house patterns.
4. **F-3 / F-6** — replace `window.confirm` with `ConfirmDialog` ; move validation from toasts to inline field errors.
5. **C-1 / C-2** — per-page titles ; ship or de-document `/admin/feature-flags`.
