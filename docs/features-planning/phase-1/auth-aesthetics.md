# Auth — Aesthetics

## Context

The auth surface is the single highest-stakes first impression the app will ever make. Every user; admin, moderator, developer, student, ambassador; passes through it before seeing anything else. A user who lands here and feels "this is serious, considered, and for me" converts faster, trusts the product more, and forgives later rough edges. A user who lands on a generic SaaS login loses that all at once.

Surface covered by this doc:

- `/signin` — email + password entry
- `/signup` — account creation
- `/signin/totp` — 2FA challenge (see [`auth-totp.md`](auth-totp.md))
- `/forgot-password` — request a reset link
- `/reset-password/[token]` — set new password
- `/verify-email/[token]` — email confirmation landing
- `/account/security/totp` — TOTP enrollment (inside the authenticated shell, but the enrollment moment deserves auth-grade polish)

Monark's public brand today is minimal: a standalone SVG logo at [monark.io](https://monark.io) and the tagline "Fostering Collaboration within the Web3 Community." The auth aesthetics have to respect that minimalism while making the transition from marketing into product feel deliberate rather than accidental.

## Goals

- Make the auth pages feel like premium product entry points, not form-on-white utility pages.
- Inherit brand constants (logo, tagline, palette tokens) from a single source so a future brand refresh is a token change, not a page rewrite.
- Reinforce the web3 / community-governance positioning without leaning on crypto-bro visual clichés (glowing particles, holographic gradients, hexagons everywhere).
- Equal quality across the five pages above; consistency beats occasional brilliance.
- Zero layout shift, zero flash of unstyled content, snappy input latency; aesthetics die if the page feels laggy.

## Non-goals

- Not defining the Monark brand book. Colors, typography, logo rules are owned by brand design and consumed here as tokens.
- Not designing the marketing site (`monark.io`). That is a separate surface with separate constraints.
- Not prescribing a specific illustration style or mascot. The first version is photograph-free, illustration-free; ornament comes from typography, light, and layout.
- Not specifying content for `/` (the in-app root redirect). That is the role-home surface and deserves its own aesthetics pass.

## Brand constants

These are the fixed points every auth page hangs off of. They live in `@monark/ui` (the published shadcn-compatible registry) and are consumed by `@monark/components` and `@monark/auth/client`.

| Constant | Location | Notes |
|---|---|---|
| Wordmark | `@monark/ui/brand/wordmark.svg` | Horizontal; used in compact header contexts |
| Standalone logo | `@monark/ui/brand/logo.svg` | Square; used as hero device on auth pages |
| Tagline | "Fostering collaboration within the Web3 community" | Shown once per auth page, in the brand panel |
| Color tokens | `@monark/ui/tokens/colors.css` | See **Palette tokens** below |
| Type tokens | `@monark/ui/tokens/type.css` | See **Typography** below |
| Motion tokens | `@monark/ui/tokens/motion.css` | See **Motion** below |

Auth pages **never hardcode** a hex or a pixel value. Every visual decision reads from a token so the brand team can re-theme without a feature rewrite.

## Layout

### Desktop (≥ 1024px)

Two-column split.

```
┌──────────────────────────────┬──────────────────────┐
│                              │                      │
│        brand panel           │       form card      │
│      (hero + tagline)        │                      │
│                              │                      │
│   ~60% viewport width        │    ~40%              │
│   ambient light background   │    solid surface     │
│                              │                      │
└──────────────────────────────┴──────────────────────┘
```

- **Left (brand panel):** logo vertically centered, tagline below, one subtle secondary line ("Sign in to continue" or "Create your Monark account"). Background is a dark surface with a slow-moving ambient gradient; no content beyond those three lines.
- **Right (form panel):** solid surface, form card centered vertically, max-width 440px. Tiny legal links (Privacy · Terms) muted at the very bottom.

Proportions breathe. Vertical rhythm target: ~80px between major blocks on desktop.

### Tablet (640–1023px)

Same two-column, tighter ratio (~50/50). Form panel keeps 440px max form width even if the column is wider.

### Mobile (< 640px)

Single column. Brand panel collapses to a 25vh top banner (logo centered, no tagline). Form fills the rest. Sticky "Already have an account?" / "Don't have one?" link anchored to the bottom safe area.

### Never

- Centered modal-style form floating on a full-bleed hero image.
- Sidebar + content layouts; auth isn't an authenticated surface.
- Visible site navigation or footer beyond legal links.

## Palette tokens

Tokens, not hex codes. The brand team picks the values; the auth pages consume by name. Required tokens:

- `--color-bg-base` — deep neutral; frames the ambient light
- `--color-bg-elevated` — surfaces (form card, elevated chips)
- `--color-bg-form-panel` — right column solid surface
- `--color-surface-stroke` — 1px borders at low opacity
- `--color-accent-primary` — the one energetic brand accent; used on primary CTA and focus rings
- `--color-accent-primary-foreground` — text on accent background
- `--color-accent-glow` — the ambient light in the brand panel; a translucent radial
- `--color-text-primary` — near-max-contrast body text
- `--color-text-muted` — secondary text, labels, helper
- `--color-text-subtle` — tertiary (legal footer, "optional" hints)
- `--color-danger` — validation errors; desaturated, never pure red
- `--color-success` — verified states; paired with an icon, not color-alone

Dark-first. The auth surface forces the dark palette regardless of the user's system preference; light theme resumes once the user is inside the authenticated shell. Rationale: the ambient glow, logo contrast, and premium feel depend on a dark canvas; a forced-light auth page loses all three.

## Typography

Four type roles map to four tokens. Assume a single humanist-geometric sans family (e.g. Inter Display, Söhne, Space Grotesk, or a brand-chosen alternative) plus one monospace accent.

| Role | Token | Usage |
|---|---|---|
| Hero display | `--type-display` | Brand-panel secondary line, occasional |
| Heading | `--type-heading` | Form title ("Welcome back", "Create your account") |
| Body | `--type-body` | Labels, helper text, links |
| Mono accent | `--type-mono` | OTP character boxes, recovery-code display, correlation IDs |

Rules:

- Form heading ~28–32px desktop, tight line-height, medium weight. Not display-sized; this is a product page, not a billboard.
- Body 14–15px. Labels the same, often uppercase-spaced for small-caps feel (optional; brand call).
- Mono only where the content is literally a code or identifier. No "retro terminal" aesthetic.
- Never all-caps heading. "WELCOME BACK" looks shouty; "Welcome back" sets the tone.

## Surface: card, inputs, buttons

### Form card

- 1px stroke at `--color-surface-stroke` opacity; radius 12px.
- Background `--color-bg-elevated`.
- Soft multi-layer shadow on light backgrounds; on the dark auth palette, use a subtle top-edge highlight (1px inner-gradient) instead of a drop shadow; drop shadows disappear on dark bg.
- Internal padding 32px desktop, 24px mobile.

### Inputs

- Height 48px minimum (touch target).
- Radius 10px; matches the card minus 2.
- Label **above** the field. Placeholder is secondary hint only, never load-bearing.
- Focus state: 2px ring in `--color-accent-primary` with a subtle background shift on the field; animated in over 150ms.
- Validation errors inline below the field in `--color-danger`, icon on the left, one sentence max.
- Password fields: show/hide toggle as an icon button inside the field, right-aligned, 16px icon, muted by default, accent on hover.

### Buttons

- Primary CTA ("Sign in", "Create account", "Verify"): full-width of the form, 52px tall, accent background, medium-weight label. Subtle gradient from `--color-accent-primary` to a slightly darker variant gives dimension without shouting.
- Hover: 2px translate-y upward with a 120ms cubic-bezier ease, shadow deepens.
- Active/press: 80ms compress to baseline.
- Loading: label swaps for a 20px spinner in the foreground color; button stays the same width (no layout shift).
- Secondary (rare on auth): ghost style, no background, accent label on hover.
- Social / SSO buttons (if added later): outline style, 48px tall, brand icon left, neutral label. Row them horizontally when there are ≤ 3 providers; stack when more.

## Motion

Use `--motion-duration-fast` (150ms), `--motion-duration-base` (250ms), `--motion-duration-slow` (20s+ ambient).

- **Page enter:** form card fades in with a 12px y-translate over 300ms ease-out. Brand panel fades in 100ms later (staggered).
- **Input focus:** ring fades in over 150ms.
- **Button press:** 80ms compress.
- **Button success:** 200ms color/label swap to the success state; hold for 400ms before navigating.
- **Ambient gradient:** slow orbital hue or position shift over 20s+, looping infinitely, GPU-accelerated (transform/opacity only; never animate width/height/filter).
- **Validation shake:** one 250ms 6-keyframe shake on the form card after a failed submit; only once per failure; not on subsequent related errors.
- **Everything respects `prefers-reduced-motion`**: ambient gradient stops; page-enter becomes an instant opacity fade (no translate); validation shake disabled.

## Page-by-page

### `/signin`

- Heading: "Welcome back"
- Subtext: "Sign in to continue to Monark."
- Fields: email, password
- Primary CTA: "Sign in"
- Secondary links, below the card, centered: "Forgot password?" · "Create an account"
- After submit:
  - Success → redirect to role home.
  - Invalid credentials → form shake + inline message "Email or password is incorrect"; field values preserved.
  - Requires TOTP → route to `/signin/totp` with the partial session in URL-less server state.

### `/signup`

- Heading: "Create your Monark account"
- Subtext: "Join the Monark community in under a minute."
- Fields: email, password, confirm password
- Password field renders the strength meter inline (see [`auth-password-strength.md`](auth-password-strength.md)); meter uses accent-glow → green progression, not traffic light.
- Primary CTA: "Create account"
- Legal microcopy **above** the button, not in a checkbox: "By creating an account, you agree to our Terms and Privacy Policy." Both words link.
- Below the card: "Already have an account? Sign in"

### `/signin/totp`

- Heading: "Two-factor authentication"
- Subtext: "Enter the 6-digit code from your authenticator app."
- Single row of 6 individual character boxes (radius 10px, 52×52, centered, mono font). Paste fills all 6; auto-advance between boxes; auto-submit on 6th digit.
- Below: "Use a recovery code instead" as a ghost link.
- No "resend code" because TOTP isn't network-delivered.

### `/forgot-password`

- Heading: "Reset your password"
- Subtext: "We'll email you a link to set a new one."
- Single email field. Primary CTA: "Send reset link."
- Success state **replaces** the form in place with a calm confirmation panel + email icon + "Check your inbox." Don't navigate away; users often need to re-read the email field.

### `/reset-password/[token]`

- Heading: "Set a new password"
- Two password fields with strength meter on the first.
- Primary CTA: "Update password"
- On success, auto-sign-in and redirect to role home (assumes the reset token proves identity).

### `/verify-email/[token]`

- Full brand panel hero; no form card; center-stage success icon and heading.
- Success: "Your email is verified" + large "Continue to Monark" CTA.
- Failure (expired/invalid): "This link has expired" + "Request a new verification email" CTA.

### `/account/security/totp` (enrollment)

- Sits inside the authenticated shell, but the QR-scan and recovery-code display moments are auth-grade: same card styling, same typography scale for the QR modal.
- Recovery codes displayed in a mono grid (2 columns × 5 rows); a "Copy all" button and a required "I've saved these somewhere safe" checkbox before "Done" unlocks.
- No success confetti. A quiet green check and "Two-factor enabled" line does the job.

## Accessibility

- WCAG AA minimum across all text; AAA targeted for body copy on auth pages.
- Never rely on color alone for state: errors get an icon + text + color; validated fields get a check + color.
- Focus ring always visible; no `outline: none` without an equivalent replacement.
- Every form field has an associated `<label>`; placeholder is decorative only.
- Keyboard-only sign-in must complete without a detour through mouse-only controls; test end-to-end each release.
- Screen-reader-only labels on icon buttons ("Toggle password visibility").
- Error summary: on submit failure, move focus to the first invalid field and announce the error via `aria-live="polite"` on a summary region.

## Copy tone

- Inviting but precise. "Welcome back" beats "Sign in." "Create your Monark account" beats "Register."
- Errors are specific and short. "Email or password is incorrect" beats "An error occurred." Never expose which specific field failed for credential checks (security).
- No exclamation points except on verified-success moments. Even then, used sparingly.
- No "Woohoo!" / "You're awesome!" celebration copy. The audience is savvy; restraint reads as confidence.
- Legal microcopy is unapologetic and unhidden, but small. Never buried.

## Dark / light

- Auth pages force the dark palette regardless of system or user preference. The ambient glow and logo treatment depend on a dark canvas.
- Once authenticated, the app respects the user's preference (which they can set per-account).
- The forced-dark choice is a one-line override at the auth layout level; cheap to revisit if it turns out to be a conversion drag (measure before rolling back).

## Implementation notes

- Tokens live in `@monark/ui/tokens/*.css` and get installed into `packages/components` via the shadcn CLI.
- Auth page components live in `packages/auth/src/client/pages/`; they compose primitives from `@monark/components`.
- The brand panel component (`<AuthBrandPanel>`) is reused across all seven pages; page-specific content sits in the right column.
- Ambient gradient is a pure CSS `radial-gradient` + `@keyframes` + `transform`; no canvas, no WebGL, no library. If the brand team asks for something richer, the upgrade path is a single component swap.
- Font files self-hosted via `next/font/local` to avoid FOUT and third-party latency. Woff2 only.

## Anti-patterns

- Glassmorphism layered on glassmorphism. One translucent surface max per page.
- Animated particle backgrounds. They date instantly and destroy battery.
- Crypto-holographic gradients (the "NFT landing page" look). Wrong signal for a community collaboration platform.
- Autoplay video hero on `/signin`.
- Social proof logos ("Trusted by…") on auth pages. Belongs on marketing, not here.
- "Create account in 10 seconds!" hyperbole. Show, don't promise.
- Password-strength copy that shames ("Weak! Try again."). The meter is enough.
- Sign-in modal opened from within the authenticated shell. If a session expires, redirect to `/signin` with a return-to param; don't overlay.

## Risks

- **Designer-developer drift.** The tokens shield against this at a value level, but layout and motion decisions still live in code. Mitigate with a Figma frame per page that engineering treats as source-of-truth, updated in the same PR as the code change.
- **Dark-forced auth hurts conversion for light-theme-preferring users.** Unlikely but measurable; log and revisit.
- **Ambient gradient CPU cost on low-end devices.** `prefers-reduced-motion` handles the accessibility case; for CPU-only, gate on a `matchMedia("(max-resolution: 1.5dppx)")` check if profiling shows pain.
- **Brand token values not ready at Phase 1 start.** Fallback: use placeholder values that approximate the final palette; a token swap is diff-local when the real values arrive.

## Success metrics

- Time-to-interactive on `/signin` and `/signup`: p75 < 1.5s, p95 < 3s on a mid-tier mobile device.
- Cumulative Layout Shift: 0 on both pages (auth pages have no ads, no hydration reshuffles; there's no excuse).
- Sign-up completion rate from `/signup` landing to verified account: baseline first, improve against baseline.
- Assistive technology smoke test: sign-in completable with VoiceOver + Safari and NVDA + Firefox without hacks.
- Zero visual regressions in a Playwright screenshot test on the seven pages above; the screenshot baseline lives in the auth package.

## Out of scope

- Social sign-in UX / button treatment (no SSO in Phase 1).
- Passkey / WebAuthn sign-in UI (future phase).
- Illustrated empty states or mascot artwork.
- Rebranding or logo variants.
- Marketing site aesthetics (`monark.io`).
- In-app shell aesthetics (dashboard, navigation, data tables). Separate spec, separate phase.
