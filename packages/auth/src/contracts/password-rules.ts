export const PASSWORD_RULES = {
  minLength: 12,
  minCharClasses: 3,
  emailSubstringMinLength: 4,
  displayNameSubstringMinLength: 4,
} as const

export type PasswordFailureReason =
  | "too-short"
  | "not-enough-char-classes"
  | "breached"
  | "contains-email"
  | "contains-display-name"

export type PasswordCheckResult =
  | { ok: true; score: 0 | 1 | 2 | 3 | 4 }
  | { ok: false; reasons: PasswordFailureReason[]; score: 0 | 1 | 2 | 3 | 4 }

export type PasswordContext = {
  email?: string
  displayName?: string
}

export const PASSWORD_RULE_HINTS: Record<
  Exclude<PasswordFailureReason, "breached">,
  string
> = {
  "too-short": `At least ${PASSWORD_RULES.minLength} characters.`,
  "not-enough-char-classes": `Mix of ${PASSWORD_RULES.minCharClasses}+ character types (lowercase, uppercase, digits, symbols).`,
  "contains-email": "Doesn't contain your email.",
  "contains-display-name": "Doesn't contain your display name.",
}
