# Auth — Password Strength Validation

## Context

Password strength is listed as a separate concern in the starter brief for a reason: requirements change, we want to enforce them in one place, and we want user-visible feedback before submission rather than a server-side "too weak" rejection. This module owns both the validation rules and the live UI feedback component.

Being strict without being annoying is the balance. Too lax and we inherit incident reports; too strict and we push people into password-manager friction or — worse — predictable substitutions.

## Goals

- One source of truth for strength rules, used by both the client meter and the server guard.
- Client-side visual feedback (strength bar + specific failure hints) that updates as the user types.
- Server-side validation that rejects anything the client would reject, even if someone bypasses the UI.
- Breached-password check against Have I Been Pwned's k-anonymity API on sign-up and password-change.
- Rules are tunable without redeploy (via feature-flag-driven config).

## Non-goals

- No custom password-hashing. Supabase Auth owns storage; we only validate pre-insert.
- No forced periodic password rotation. NIST SP 800-63B explicitly recommends against it, and we agree.
- No history check (enforce no-reuse of last N passwords) at launch. Adds complexity that doesn't pay for itself yet; revisit if compliance demands it.
- No dictionary check beyond the breached-password check. The HIBP dataset effectively covers this.

## Rules

At submission time, a password must:

1. Be at least **12 characters** long.
2. Contain at least three of: lowercase letter, uppercase letter, digit, symbol.
3. Not appear in Have I Been Pwned's breached-password list (k-anonymity query: send first 5 chars of SHA-1, check returned suffixes locally).
4. Not contain the user's email local-part (case-insensitive, ≥ 4 consecutive chars matching).
5. Not contain the user's display name (case-insensitive, ≥ 4 consecutive chars matching), if the display name is known at validation time.

The strength *meter* is more permissive than the rules: it displays a 0–4 score using zxcvbn (or `@zxcvbn-ts/core`) so users get feedback on "very weak → strong" even when they've cleared the hard rules. Passing hard rules ≠ green meter; the meter encourages better, the rules gate acceptance.

## Data model

No new tables. Strength config lives in a single TypeScript export:

```ts
// packages/auth/src/server/domain/password-rules.ts
export const PASSWORD_RULES = {
  minLength: 12,
  minCharClasses: 3,
  breachedCheck: true,
  emailSubstringMinLength: 4,
} as const
```

If we ever need per-deployment tuning, move to a `feature_flags`-style row. Not needed now.

## API surface

```ts
// packages/auth/src/server/index.ts
export type PasswordCheckResult =
  | { ok: true; score: 0 | 1 | 2 | 3 | 4 }
  | { ok: false; reasons: PasswordFailureReason[]; score: 0 | 1 | 2 | 3 | 4 }

export type PasswordFailureReason =
  | "too-short"
  | "not-enough-char-classes"
  | "breached"
  | "contains-email"
  | "contains-display-name"

// Client + server usable (zxcvbn runs in both).
export function checkPasswordOffline(
  password: string,
  context?: { email?: string; displayName?: string }
): PasswordCheckResult

// Server-only (hits HIBP).
export async function checkPassword(
  password: string,
  context?: { email?: string; displayName?: string }
): Promise<PasswordCheckResult>
```

`checkPasswordOffline` is everything except the HIBP hit — runs synchronously for live UI feedback. `checkPassword` on the server does the HIBP k-anonymity query and combines results.

## UI: the strength component

Shipped as a shadcn-compatible primitive inside this module's `ui/`:

```tsx
<PasswordInput
  value={password}
  onChange={setPassword}
  context={{ email, displayName }}
  showStrengthMeter
  showHints
/>
```

Visuals:
- Input field with show/hide toggle (eye icon).
- Below: 4-segment bar colored by zxcvbn score (red → amber → green).
- Below the bar: a compact list of specific failing rules, each with a checkmark when satisfied. "At least 12 characters," "Mix of 3+ character types," "Doesn't contain your email." The HIBP check is NOT shown live (would be a fetch per keystroke); it runs once on blur and displays "This password appeared in a data breach — please choose another" if flagged.

Accessibility:
- Strength meter has an ARIA live region so screen readers announce score changes as "Weak / Fair / Good / Strong" on debounce.
- Failing rules are in a list; each has `aria-checked` or equivalent.
- Color is never the only signal; icons + text always accompany.

## HIBP integration

```ts
// packages/auth/src/server/data/hibp.ts
export async function isPasswordBreached(password: string): Promise<boolean> {
  const sha1 = sha1Hex(password).toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
    cache: "force-cache",  // the response is a static list; aggressively cached
    next: { revalidate: 3600 },
  })
  const text = await res.text()
  return text.split("\n").some(line => line.split(":")[0] === suffix)
}
```

Cache semantics: each 5-char prefix's response is ~500 entries, safely cacheable for at least an hour. For our expected traffic, this is effectively free.

## Dependencies

- `users` (for email / display name context at signup and password-change time).
- No dependency on `feature-flags` for the rules themselves (they're compiled in), but the strength UI component is obviously only rendered in pages gated by auth flags.

## Integration points

- `auth-login-password`'s signup and reset server actions call `checkPassword` before handing off to Supabase.
- `users` exposes display-name at profile edit; if a user tries to change their display name to something that overlaps their password, the display-name update is rejected with a specific error (or we regenerate their password requirement — TBD; for Phase 1, reject).

## Edge cases

- **HIBP API down.** Degrade open: if the fetch fails, log a warning and accept the password (it passed everything else). This is a tradeoff; documented loudly.
- **User pastes from password manager with extra whitespace.** Trim leading/trailing whitespace before validation. Do NOT trim within — password managers output what they output.
- **Unicode passwords.** Count Unicode code points for length, not UTF-16 units. `Array.from(password).length`.
- **Zxcvbn performance.** It's not cheap; debounce the check by 120ms on keystroke. Lazy-load the dictionary chunks when the password input is focused, not on every page.

## Risks

- **Library size.** zxcvbn with dictionaries is ~700KB. `@zxcvbn-ts` with locale-split dictionaries is better; we can ship just English dictionaries and load the locale async if we ever add i18n.
- **False positives on breached check.** Users occasionally choose a password that happens to match a breached hash coincidentally. The UX is "we can't tell you what's wrong, just try another" — annoying but correct. Keep the error copy short and direct.
- **Rule changes invalidate existing passwords.** We do NOT force existing users to change passwords on rule tightening. Only validate on creation and change.

## Success metrics

- % of signups whose first-attempt password passes on first try — watch this; < 50% signals rules are too strict.
- HIBP-flagged signup rate — informative.
- Support tickets mentioning "password" per week.

## Implementation notes

- zxcvbn runs both client-side (for live UI) and server-side (for final validation). Use `@zxcvbn-ts/core` which works in both environments.
- The `PasswordInput` component is the canonical UI — reuse everywhere a password is typed. Never hand-roll input fields.
- Feature-flag the HIBP check behind `auth.hibp-check` so it can be disabled if the endpoint has an outage and we haven't gotten around to fixing the degrade-open logic.

## Out of scope

- Password history / no-reuse enforcement
- Required rotation
- Password-manager integration beyond standard HTML autocomplete hints
- Custom allowlist / denylist of strings beyond the email+displayName check
