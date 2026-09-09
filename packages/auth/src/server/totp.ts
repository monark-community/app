import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createGuardrails, generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import { BRANDING } from "@monark/branding";
import { emit, logger, ConflictError, ValidationError } from "@monark/common";
import { getDb } from "@monark/db";
import { isEnabled } from "@monark/feature-flags/server";
import { adminAssignmentSummary } from "@monark/rbac/server";
import type {
  TotpDisabledEvent,
  TotpEnabledEvent,
  TotpRecoveryCodeUsedEvent,
  TotpRecoveryCodesRegeneratedEvent,
} from "../contracts/events";
import { decryptSecret, encryptSecret } from "./crypto";
const RECOVERY_CODE_COUNT = 10;
// A ±1 step (30 sec either side) catches mild client clock skew without
// opening the door to brute force beyond what the 6-digit code already allows.
// otplib v13 states this as seconds of epoch tolerance rather than v12's
// `window` step count ; at the default 30 sec period the two are the same
// tolerance, and a code two steps out is still rejected.
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

// otplib v12's `authenticator.generateSecret()` defaulted to **10** bytes, so
// every enrollment made before the v13 upgrade holds an 80-bit secret. v13
// added a `MIN_SECRET_BYTES = 16` guardrail that *throws* `SecretTooShortError`
// rather than returning `{ valid: false }`, which took every pre-upgrade
// authenticator offline the moment the upgrade shipped : the throw travelled up
// through `verifyTotpCode` and the tRPC boundary into the sign-in action's
// catch-all, where it read to the user as "that code is invalid". A correct
// code from a correctly-synced app could never be accepted again.
//
// The v13 changelog entry claimed enrolled users were unaffected because both
// versions mint "the same 32-character Base32 secret" ; that is true of v13's
// `generateSecret()` (20 bytes) but not of the v12 default this codebase
// actually ran, which produced 16 characters. Nothing caught it because the
// integration suite enrolls fresh inside each test, so it only ever exercises
// a v13-length secret.
//
// Lowering the verification floor to the v12 default keeps those enrollments
// working. It only relaxes what we accept from secrets already in the database ;
// `beginTotpEnrollment` still calls v13's `generateSecret()`, so every new
// enrollment gets the RFC 4226-recommended 20 bytes.
const LEGACY_MIN_SECRET_BYTES = 10;
const TOTP_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: LEGACY_MIN_SECRET_BYTES });

// v13 replaced the stateful `authenticator` singleton with per-call options,
// so the tolerance travels with each verification instead of being set once
// as global module state.
//
// `verifySync` distinguishes "this code doesn't match" (a `valid: false`
// result) from "this input can't be verified at all" (a throw). Only the first
// is a user error, but every caller above us funnels both into the same
// "invalid code" copy, which is how the guardrail regression above stayed
// invisible : a hard failure wearing a typo's clothes. Log the throw before it
// travels, so the next one shows up in the api logs instead of only in a
// support ticket. Rethrow rather than returning false ; a verification we
// couldn't perform is not a verification that failed.
function checkTotpCode(token: string, secret: string): boolean {
  try {
    return verifySync({
      secret,
      token,
      epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
      guardrails: TOTP_GUARDRAILS,
    }).valid;
  } catch (error) {
    logger.error(
      { err: error, secretLength: secret.length },
      "totp verification threw; the code was not checked (this reads as an invalid code to the user)",
    );
    throw error;
  }
}

export type TotpStatus =
  | { enrolled: false }
  | { enrolled: true; activatedAt: Date | null; remainingRecoveryCodes: number };

export async function getTotpStatus(userId: string): Promise<TotpStatus> {
  const db = getDb();
  const secret = await db.totpSecret.findUnique({
    where: { userId },
    include: {
      recoveryCodes: { where: { usedAt: null } },
    },
  });
  // `activatedAt`, not mere row existence. `beginTotpEnrollment` writes a
  // secret the moment a QR is generated, so a user who opened the
  // enrollment card and walked away leaves a row behind with
  // `activatedAt` null. Treating that as enrolled is a lockout: every
  // security gate (change password, set password, change email, unlink a
  // provider) would then demand a code from an authenticator the user
  // never finished adding, and `verifyTotpCode` can't accept one because
  // the secret was never activated.
  //
  // `isTotpActive` below has always keyed off the same field ; this makes
  // the two agree.
  if (!secret?.activatedAt) return { enrolled: false };
  return {
    enrolled: true,
    activatedAt: secret.activatedAt,
    remainingRecoveryCodes: secret.recoveryCodes.length,
  };
}

export async function isTotpActive(userId: string): Promise<boolean> {
  const db = getDb();
  const secret = await db.totpSecret.findUnique({
    where: { userId },
    select: { activatedAt: true },
  });
  return Boolean(secret?.activatedAt);
}

// Returns the secret + an inline SVG QR pointing at `otpauth://...`.
// Replaces any previous in-progress enrollment (activatedAt null)
// atomically ; activated enrollments must be explicitly disabled first.
//
// SVG rather than PNG so the client can theme it with one CSS rule:
// the QR modules are emitted with `fill="currentColor"` (we ask qrcode
// for solid black and rewrite the hex to `currentColor` in the returned
// string) and the background is transparent. Dropping it inside a
// `text-foreground` element makes it black on light themes, white on
// dark, with no `<img>` filter trick.
export async function beginTotpEnrollment(input: {
  userId: string;
  accountLabel: string;
}): Promise<{ secret: string; qrSvg: string }> {
  const db = getDb();
  const existing = await db.totpSecret.findUnique({ where: { userId: input.userId } });
  if (existing?.activatedAt) {
    throw new ConflictError("TOTP is already active; disable it before re-enrolling.");
  }

  const secret = generateSecret();
  const otpauth = generateURI({
    issuer: BRANDING.totpIssuer,
    label: input.accountLabel,
    secret,
  });
  const rawSvg = await qrcode.toString(otpauth, {
    type: "svg",
    margin: 1,
    color: { dark: "#000000ff", light: "#00000000" },
  });
  // qrcode's SVG bakes the dark color as a literal `#000000` attribute on
  // the path ; swap to `currentColor` so the foreground tracks the
  // surrounding text colour. The transparent background is already there
  // from the `light: "#00000000"` option above.
  const qrSvg = rawSvg.replace(/#000000/g, "currentColor");
  const encrypted = encryptSecret(secret);

  if (existing) {
    await db.$transaction([
      db.recoveryCode.deleteMany({ where: { totpSecretId: existing.id } }),
      db.totpSecret.delete({ where: { id: existing.id } }),
    ]);
  }
  await db.totpSecret.create({
    data: {
      userId: input.userId,
      secretCipher: Uint8Array.from(encrypted.cipher),
      secretIv: Uint8Array.from(encrypted.iv),
      secretTag: Uint8Array.from(encrypted.tag),
    },
  });

  return { secret, qrSvg };
}

function generateRecoveryCode(): string {
  // 12 hex chars (6 bytes) split into XXXX-XXXX-XXXX.
  const raw = randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// Called once the user has entered the first 6-digit code from their
// authenticator. On success, activates the enrollment and mints 10 one-time
// recovery codes (plaintext returned exactly once).
export async function confirmTotpEnrollment(input: {
  userId: string;
  code: string;
}): Promise<{ recoveryCodes: string[] }> {
  const db = getDb();
  const secret = await db.totpSecret.findUnique({ where: { userId: input.userId } });
  if (!secret) {
    throw new ValidationError("No enrollment in progress; start with beginTotpEnrollment.");
  }
  if (secret.activatedAt) {
    throw new ConflictError("TOTP is already active.");
  }

  const plaintext = decryptSecret({
    cipher: Buffer.from(secret.secretCipher),
    iv: Buffer.from(secret.secretIv),
    tag: Buffer.from(secret.secretTag),
  });
  const ok = checkTotpCode(input.code.trim(), plaintext);
  if (!ok) {
    throw new ValidationError("That code is invalid. Check the time on your device.");
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await db.$transaction([
    db.totpSecret.update({
      where: { id: secret.id },
      data: { activatedAt: new Date() },
    }),
    db.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ totpSecretId: secret.id, codeHash })),
    }),
  ]);

  const event: TotpEnabledEvent = {
    type: "totp.enabled",
    userId: input.userId,
    occurredAt: new Date(),
  };
  await emit(event);

  return { recoveryCodes };
}

// Per-user, per-minute cap on `verifyTotpCode`. Sliding-window logic lives
// in the standalone `totp-rate-limit.ts` module (single-process, in-memory)
// so the unit suite can exercise it without pulling in Prisma/Supabase.
import { recordVerifyAttempt, TotpRateLimitError } from "./totp-rate-limit";

export { TotpRateLimitError } from "./totp-rate-limit";

export async function verifyTotpCode(input: { userId: string; code: string }): Promise<boolean> {
  const limit = recordVerifyAttempt(input.userId);
  if (!limit.allowed) throw new TotpRateLimitError();
  const db = getDb();
  const secret = await db.totpSecret.findUnique({ where: { userId: input.userId } });
  if (!secret?.activatedAt) return false;
  const plaintext = decryptSecret({
    cipher: Buffer.from(secret.secretCipher),
    iv: Buffer.from(secret.secretIv),
    tag: Buffer.from(secret.secretTag),
  });
  return checkTotpCode(input.code.trim(), plaintext);
}

// Consumes one unused recovery code (bcrypt-compared). Returns true if the
// code matched and was just now marked used.
export async function verifyRecoveryCode(input: {
  userId: string;
  code: string;
}): Promise<boolean> {
  const db = getDb();
  const secret = await db.totpSecret.findUnique({
    where: { userId: input.userId },
    include: { recoveryCodes: { where: { usedAt: null } } },
  });
  if (!secret) return false;

  const candidate = input.code.trim().toUpperCase();
  for (const row of secret.recoveryCodes) {
    const match = await bcrypt.compare(candidate, row.codeHash);
    if (!match) continue;
    const updated = await db.recoveryCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (updated.count === 0) return false;
    const remaining = secret.recoveryCodes.length - 1;
    const event: TotpRecoveryCodeUsedEvent = {
      type: "totp.recovery-code-used",
      userId: input.userId,
      remainingCodes: remaining,
      occurredAt: new Date(),
    };
    await emit(event);
    return true;
  }
  return false;
}

// Recovery-code regeneration always requires a fresh TOTP code as
// proof of intent. Earlier we explored a no-TOTP shortcut gated on a
// recent recovery-code use ("just signed in via recovery code, lost
// my authenticator, give me a fresh batch") but that turns the
// threat model upside down : an attacker who steals one recovery
// code (paper photo, leaky password manager, …) gets a one-click
// path to mint a new batch and lock the legitimate user out of the
// recovery path entirely. Industry norm (Google, GitHub, AWS) is to
// require the second factor for regen, full stop ; the
// lost-authenticator user proceeds via account recovery (support /
// ID verification), not via in-app self-service.
export async function regenerateRecoveryCodes(input: {
  userId: string;
  code: string;
}): Promise<string[]> {
  const ok = await verifyTotpCode(input);
  if (!ok) throw new ValidationError("Invalid TOTP code.");
  const db = getDb();
  const secret = await db.totpSecret.findUnique({ where: { userId: input.userId } });
  if (!secret) throw new ValidationError("TOTP is not enrolled.");

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { totpSecretId: secret.id } }),
    db.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ totpSecretId: secret.id, codeHash })),
    }),
  ]);

  const event: TotpRecoveryCodesRegeneratedEvent = {
    type: "totp.recovery-codes-regenerated",
    userId: input.userId,
    count: recoveryCodes.length,
    occurredAt: new Date(),
  };
  await emit(event);

  return recoveryCodes;
}

// Read surface for the post-sign-in reminder modal. Returns the data
// the client needs to decide which mode to render (acknowledge / low
// quota / forced regen) without exposing the recovery codes themselves
// (which we only have as bcrypt hashes anyway).
//
// `hasUnacknowledgedUse` triggers the strike-it-from-your-list flow ;
// `remainingCodes < 3` triggers the "running low" suggestion ;
// `remainingCodes === 0` makes the modal blocking. The callers compose
// the mode from these primitives.
export type RecoveryCodeStatus = {
  enrolled: boolean;
  hasUnacknowledgedUse: boolean;
  /** Most recent used+unacked timestamp, for "you used a code on …" copy. */
  lastUnacknowledgedUseAt: Date | null;
  remainingCodes: number;
};

export async function getRecoveryCodeStatus(userId: string): Promise<RecoveryCodeStatus> {
  const db = getDb();
  const secret = await db.totpSecret.findUnique({
    where: { userId },
    select: {
      activatedAt: true,
      recoveryCodes: {
        select: { id: true, usedAt: true, acknowledgedAt: true },
      },
    },
  });
  if (!secret || !secret.activatedAt) {
    return {
      enrolled: false,
      hasUnacknowledgedUse: false,
      lastUnacknowledgedUseAt: null,
      remainingCodes: 0,
    };
  }
  const remaining = secret.recoveryCodes.filter((row) => row.usedAt === null).length;
  const unacked = secret.recoveryCodes
    .filter((row) => row.usedAt !== null && row.acknowledgedAt === null)
    .sort((a, b) => (b.usedAt?.getTime() ?? 0) - (a.usedAt?.getTime() ?? 0));
  return {
    enrolled: true,
    hasUnacknowledgedUse: unacked.length > 0,
    lastUnacknowledgedUseAt: unacked[0]?.usedAt ?? null,
    remainingCodes: remaining,
  };
}

// Marks every used+unacked recovery row for the user as acknowledged.
// Idempotent ; running it twice is a no-op the second time. The user
// triggers this when they confirm they've struck the spent code from
// their saved list.
export async function acknowledgeRecoveryCodeUse(userId: string): Promise<void> {
  const db = getDb();
  await db.recoveryCode.updateMany({
    where: {
      usedAt: { not: null },
      acknowledgedAt: null,
      totpSecret: { userId },
    },
    data: { acknowledgedAt: new Date() },
  });
}

// Requires a current TOTP code to confirm intent. Password re-entry is
// enforced upstream by the calling server action (which has the Supabase
// client in its scope).
export async function disableTotp(input: { userId: string; code: string }): Promise<void> {
  const ok = await verifyTotpCode(input);
  if (!ok) throw new ValidationError("Invalid TOTP code.");
  const db = getDb();
  await db.totpSecret.delete({ where: { userId: input.userId } });
  const event: TotpDisabledEvent = {
    type: "totp.disabled",
    userId: input.userId,
    triggeredBy: "user",
    occurredAt: new Date(),
  };
  await emit(event);
}

// True when the user has activated TOTP AND the current device hasn't
// already cleared a TOTP challenge (or the trust-devices flag is off).
export async function requiresTotpChallenge(input: {
  userId: string;
  trustedDeviceId: string | null;
}): Promise<boolean> {
  const active = await isTotpActive(input.userId);
  if (!active) return false;

  const trustDevicesFlag = await isEnabled("auth.totp-trust-devices", {
    userId: input.userId,
  });
  if (!trustDevicesFlag) return true;
  if (!input.trustedDeviceId) return true;

  const db = getDb();
  const device = await db.trustedDevice.findFirst({
    where: {
      id: input.trustedDeviceId,
      userId: input.userId,
      revokedAt: null,
      // An expired device shouldn't carry forward its prior TOTP-cleared
      // state ; treat it as "no trusted device" so the challenge fires.
      expiresAt: { gt: new Date() },
    },
    select: { totpVerifiedAt: true },
  });
  return !device?.totpVerifiedAt;
}

// Stamped once the user clears a TOTP challenge on this device. Subsequent
// sign-ins from the same device skip the challenge.
export async function markDeviceTotpVerified(input: {
  userId: string;
  trustedDeviceId: string;
}): Promise<void> {
  const db = getDb();
  await db.trustedDevice.updateMany({
    where: {
      id: input.trustedDeviceId,
      userId: input.userId,
      revokedAt: null,
      // Don't stamp totpVerifiedAt on an expired row — it'd be ignored
      // by the trust check anyway, but updating it would mask the
      // expiry in audit logs.
      expiresAt: { gt: new Date() },
    },
    data: { totpVerifiedAt: new Date() },
  });
}

// Hours after which an unactivated TOTP enrollment is considered stale and
// safe to drop. Lets the user start enrollment, walk away for a coffee, and
// pick up where they left off; anything beyond a day is almost certainly
// abandoned.
const STALE_ENROLLMENT_HOURS = 24;

// Drops `TotpSecret` rows where `activatedAt` is null and `enrolledAt` is
// older than `STALE_ENROLLMENT_HOURS`. Idempotent; intended to be called
// from a daily cron once one is wired. Returns the number of rows dropped
// so the caller can log + alert if a sudden spike appears.
export async function cleanupStaleTotpEnrollments(): Promise<{ dropped: number }> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_ENROLLMENT_HOURS * 60 * 60 * 1000);
  const result = await db.totpSecret.deleteMany({
    where: {
      activatedAt: null,
      enrolledAt: { lt: cutoff },
    },
  });
  return { dropped: result.count };
}

// Days from first admin assignment after which the soft-wall escalates to
// a hard-wall covering all routes (not just /admin/**). Per spec.
const ADMIN_TOTP_HARDWALL_DAYS = 7;

export type AdminTotpEnforcement =
  | { required: false }
  | { required: true; mode: "soft" | "hard"; daysOverdue: number };

// Decides whether an admin user must enroll TOTP and at what enforcement
// strength. Used by the /admin route guard and the /account banner.
//
// - "soft": redirect from /admin/** to /account?totpRequired=1 with a banner.
//   Other routes still work.
// - "hard": redirect from EVERY route except /account, /signin, /signout to
//   the same place. Triggered after `ADMIN_TOTP_HARDWALL_DAYS` from the
//   earliest admin grant.
export async function adminTotpEnforcement(userId: string): Promise<AdminTotpEnforcement> {
  const flagOn = await isEnabled("auth.totp-required-admin", { userId });
  if (!flagOn) return { required: false };
  const summary = await adminAssignmentSummary(userId);
  if (!summary.hasAdmin) return { required: false };
  const totpOn = await isTotpActive(userId);
  if (totpOn) return { required: false };
  const grantedAt = summary.earliestGrantedAt ?? new Date();
  const ageMs = Date.now() - grantedAt.getTime();
  const daysSince = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const mode: "soft" | "hard" = daysSince >= ADMIN_TOTP_HARDWALL_DAYS ? "hard" : "soft";
  const daysOverdue = Math.max(0, daysSince - ADMIN_TOTP_HARDWALL_DAYS);
  return { required: true, mode, daysOverdue };
}
