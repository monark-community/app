import {
  PASSWORD_RULES,
  type PasswordCheckResult,
  type PasswordContext,
  type PasswordFailureReason,
} from "./password-rules";

function codePointLength(s: string): number {
  return Array.from(s).length;
}

function charClasses(s: string): number {
  let classes = 0;
  if (/[a-z]/.test(s)) classes++;
  if (/[A-Z]/.test(s)) classes++;
  if (/[0-9]/.test(s)) classes++;
  if (/[^a-zA-Z0-9]/.test(s)) classes++;
  return classes;
}

function containsSubstring(haystack: string, needle: string, minLen: number): boolean {
  if (!needle || needle.length < minLen) return false;
  const lcHay = haystack.toLowerCase();
  const lcNeedle = needle.toLowerCase();
  for (let i = 0; i + minLen <= lcNeedle.length; i++) {
    const slice = lcNeedle.slice(i, i + minLen);
    if (lcHay.includes(slice)) return true;
  }
  return false;
}

function emailLocalPart(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function scoreFor(length: number, classes: number): 0 | 1 | 2 | 3 | 4 {
  if (length < 8) return 0;
  if (length < 12) return 1;
  if (length >= 20 && classes >= 3) return 4;
  if (length >= 16 && classes >= 3) return 3;
  return 2;
}

// Pure: safe to call from both the browser (live UI feedback) and the server
// (final validation, combined with the HIBP check in `checkPassword`).
export function checkPasswordOffline(
  password: string,
  context: PasswordContext = {},
): PasswordCheckResult {
  const trimmed = password.trim();
  const reasons: PasswordFailureReason[] = [];

  const length = codePointLength(trimmed);
  if (length < PASSWORD_RULES.minLength) reasons.push("too-short");

  const classes = charClasses(trimmed);
  if (classes < PASSWORD_RULES.minCharClasses) reasons.push("not-enough-char-classes");

  const localPart = emailLocalPart(context.email);
  if (localPart && containsSubstring(trimmed, localPart, PASSWORD_RULES.emailSubstringMinLength)) {
    reasons.push("contains-email");
  }

  if (
    context.displayName &&
    containsSubstring(trimmed, context.displayName, PASSWORD_RULES.displayNameSubstringMinLength)
  ) {
    reasons.push("contains-display-name");
  }

  const score = scoreFor(length, classes);
  if (reasons.length === 0) {
    return { ok: true, score };
  }
  return { ok: false, reasons, score };
}
