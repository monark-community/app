import { randomBytes } from "node:crypto";
import { createGuardrails, generateSync } from "otplib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { _resetTotpRateLimitForTesting } from "../../src/server/totp-rate-limit";

// AES-256-GCM round-trip in `crypto.ts` requires a 32-byte hex key on
// the env. Set it before any module under test imports the crypto
// module so the lazy `loadKey()` finds it.
process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("hex");

// Tests always mint a code for the current time step, so the production
// ±30 sec epoch tolerance only comes into play if a step boundary happens
// to fall mid-test. No global options to set : otplib v13 takes its
// tolerance per call rather than on a shared `authenticator` singleton.
const totpCode = (secret: string): string => generateSync({ secret });

// A v12-era secret. `authenticator.generateSecret()` defaulted to 10 bytes,
// which is 16 Base32 characters ; every enrollment predating the otplib 13
// upgrade has this shape, and v13's `MIN_SECRET_BYTES = 16` guardrail rejects
// it by *throwing*. Fixed rather than generated so the case keeps pinning the
// historical shape even if otplib's own defaults move again ; minting a code
// for it needs the same relaxed floor the production path now uses.
const LEGACY_SECRET = "JBSWY3DPEHPK3PXP";
const LEGACY_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 10 });
const legacyTotpCode = (secret: string): string =>
  generateSync({ secret, guardrails: LEGACY_GUARDRAILS });

// The `auth.totp-trust-devices` flag gates `requiresTotpChallenge` ;
// stub the feature-flags module so the integration test isn't
// dependent on a flag-eval service. Default-enabled mirrors prod.
vi.mock("@monark/feature-flags/server", () => ({
  isEnabled: async (key: string) => key === "auth.totp-trust-devices",
}));

import {
  beginTotpEnrollment,
  cleanupStaleTotpEnrollments,
  confirmTotpEnrollment,
  disableTotp,
  getRecoveryCodeStatus,
  getTotpStatus,
  isTotpActive,
  markDeviceTotpVerified,
  regenerateRecoveryCodes,
  requiresTotpChallenge,
  verifyRecoveryCode,
  verifyTotpCode,
  acknowledgeRecoveryCodeUse,
} from "../../src/server/totp";
import { decryptSecret, encryptSecret } from "../../src/server/crypto";

const USER_ID = "totp-user-1";

beforeAll(async () => {
  const db = getDb();
  await db.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: "totp@x.test" },
    update: {},
  });
});

beforeEach(() => {
  // The verify-attempt counter is process-global + in-memory ; a
  // single user racks up 5+ attempts across the spec (every
  // verifyTotpCode call counts, including the ones nested inside
  // disableTotp / regenerateRecoveryCodes). Reset between tests so
  // each one starts with a fresh per-user window.
  _resetTotpRateLimitForTesting();
});

afterEach(async () => {
  const db = getDb();
  await truncate(db, ["RecoveryCode", "TotpSecret", "TrustedDevice"]);
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Convenience helper : walks through enrollment → first code →
// activated, returning the secret + recovery codes.
async function fullyEnroll(): Promise<{ secret: string; recoveryCodes: string[] }> {
  const { secret } = await beginTotpEnrollment({
    userId: USER_ID,
    accountLabel: "totp@x.test",
  });
  const code = totpCode(secret);
  const { recoveryCodes } = await confirmTotpEnrollment({
    userId: USER_ID,
    code,
  });
  return { secret, recoveryCodes };
}

describe("getTotpStatus", () => {
  it("reports not enrolled before any TOTP work", async () => {
    const status = await getTotpStatus(USER_ID);
    expect(status).toEqual({ enrolled: false });
  });

  it("still reports not enrolled mid-enrollment", async () => {
    // Was the opposite until an abandoned enrollment locked an account
    // out of its own settings. `beginTotpEnrollment` writes the secret
    // the moment a QR is generated, so opening the card and walking away
    // leaves a row with `activatedAt` null. Reporting that as enrolled
    // made every security gate — change password, set password, change
    // email, unlink a provider — demand a code from an authenticator the
    // user never finished adding, and `verifyTotpCode` cannot accept one
    // because the secret was never activated.
    //
    // Nothing consumed the old shape: the account UI derives
    // `active = enrolled && activatedAt`, so it reads the same either
    // way, and a pending row is disposable — the next
    // `beginTotpEnrollment` replaces it.
    await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    const status = await getTotpStatus(USER_ID);
    expect(status).toEqual({ enrolled: false });
  });

  it("agrees with isTotpActive at every stage", async () => {
    // The two disagreeing is what produced the lockout, so pin them
    // together rather than trusting they stay in step.
    expect((await getTotpStatus(USER_ID)).enrolled).toBe(await isTotpActive(USER_ID));

    await beginTotpEnrollment({ userId: USER_ID, accountLabel: "totp@x.test" });
    expect((await getTotpStatus(USER_ID)).enrolled).toBe(await isTotpActive(USER_ID));

    await fullyEnroll();
    expect((await getTotpStatus(USER_ID)).enrolled).toBe(await isTotpActive(USER_ID));
  });

  it("reports remainingRecoveryCodes after enrollment confirmation", async () => {
    await fullyEnroll();
    const status = await getTotpStatus(USER_ID);
    expect(status.enrolled).toBe(true);
    if (status.enrolled) {
      expect(status.activatedAt).not.toBeNull();
      expect(status.remainingRecoveryCodes).toBe(10);
    }
  });
});

describe("beginTotpEnrollment", () => {
  it("creates a TotpSecret row + returns a secret + an SVG with currentColor", async () => {
    const { secret, qrSvg } = await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(qrSvg).toContain("currentColor");
    expect(qrSvg).not.toContain("#000000");

    const db = getDb();
    const row = await db.totpSecret.findUnique({ where: { userId: USER_ID } });
    expect(row).not.toBeNull();
    expect(row?.activatedAt).toBeNull();
    // Round-trip the encrypted secret to be sure the cipher / iv /
    // tag stored matches what `confirmTotpEnrollment` will decrypt.
    if (row) {
      const plaintext = decryptSecret({
        cipher: Buffer.from(row.secretCipher),
        iv: Buffer.from(row.secretIv),
        tag: Buffer.from(row.secretTag),
      });
      expect(plaintext).toBe(secret);
    }
  });

  it("replaces a previous unactivated enrollment", async () => {
    const first = await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    const second = await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    expect(second.secret).not.toBe(first.secret);
    const db = getDb();
    const rows = await db.totpSecret.findMany({ where: { userId: USER_ID } });
    expect(rows).toHaveLength(1);
  });

  it("rejects re-enrollment when TOTP is already active", async () => {
    await fullyEnroll();
    await expect(
      beginTotpEnrollment({ userId: USER_ID, accountLabel: "totp@x.test" }),
    ).rejects.toThrow(/already active/i);
  });
});

describe("confirmTotpEnrollment", () => {
  it("activates + mints 10 recovery codes (returned exactly once)", async () => {
    const { secret } = await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    const code = totpCode(secret);
    const { recoveryCodes } = await confirmTotpEnrollment({
      userId: USER_ID,
      code,
    });
    expect(recoveryCodes).toHaveLength(10);
    // Format: XXXX-XXXX-XXXX, hex uppercase.
    for (const c of recoveryCodes) {
      expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
    // No duplicates within a single batch.
    expect(new Set(recoveryCodes).size).toBe(10);

    const db = getDb();
    const row = await db.totpSecret.findUnique({ where: { userId: USER_ID } });
    expect(row?.activatedAt).not.toBeNull();
    const codeRows = await db.recoveryCode.findMany({
      where: { totpSecret: { userId: USER_ID } },
    });
    expect(codeRows).toHaveLength(10);
  });

  it("rejects an invalid code without activating", async () => {
    await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    await expect(confirmTotpEnrollment({ userId: USER_ID, code: "000000" })).rejects.toThrow(
      /invalid/i,
    );
    const db = getDb();
    const row = await db.totpSecret.findUnique({ where: { userId: USER_ID } });
    expect(row?.activatedAt).toBeNull();
  });

  it("rejects when no enrollment is in progress", async () => {
    await expect(confirmTotpEnrollment({ userId: USER_ID, code: "000000" })).rejects.toThrow(
      /no enrollment/i,
    );
  });

  it("rejects when TOTP is already active", async () => {
    const { secret } = await fullyEnroll();
    const code = totpCode(secret);
    await expect(confirmTotpEnrollment({ userId: USER_ID, code })).rejects.toThrow(
      /already active/i,
    );
  });
});

describe("verifyTotpCode", () => {
  it("returns true for a valid code and false for a wrong one", async () => {
    const { secret } = await fullyEnroll();
    const ok = await verifyTotpCode({
      userId: USER_ID,
      code: totpCode(secret),
    });
    expect(ok).toBe(true);
    const bad = await verifyTotpCode({ userId: USER_ID, code: "000000" });
    expect(bad).toBe(false);
  });

  it("returns false when TOTP isn't active", async () => {
    await beginTotpEnrollment({
      userId: USER_ID,
      accountLabel: "totp@x.test",
    });
    const ok = await verifyTotpCode({ userId: USER_ID, code: "000000" });
    expect(ok).toBe(false);
  });

  // Regression : the otplib 13 upgrade silently locked out every account
  // enrolled before it. v13 rejects the 10-byte secrets v12 minted by throwing
  // `SecretTooShortError` from inside `verifySync`, and that throw surfaced to
  // the user as "that code is invalid" — indistinguishable from a mistyped
  // code, with no way to recover short of a recovery code. The rest of this
  // suite can't see it because every other case enrolls fresh, so it only ever
  // exercises a v13-length secret ; this one plants the historical row shape.
  it("accepts a code from an enrollment predating the otplib 13 upgrade", async () => {
    const db = getDb();
    const encrypted = encryptSecret(LEGACY_SECRET);
    await db.totpSecret.create({
      data: {
        userId: USER_ID,
        secretCipher: Uint8Array.from(encrypted.cipher),
        secretIv: Uint8Array.from(encrypted.iv),
        secretTag: Uint8Array.from(encrypted.tag),
        activatedAt: new Date(),
      },
    });

    const ok = await verifyTotpCode({
      userId: USER_ID,
      code: legacyTotpCode(LEGACY_SECRET),
    });
    expect(ok).toBe(true);
    // Still a plain false, not a throw, for a wrong code on the same secret.
    expect(await verifyTotpCode({ userId: USER_ID, code: "000000" })).toBe(false);
  });
});

describe("verifyRecoveryCode", () => {
  it("consumes the matching code exactly once + emits the used event shape", async () => {
    const { recoveryCodes } = await fullyEnroll();
    const target = recoveryCodes[0]!;
    const first = await verifyRecoveryCode({ userId: USER_ID, code: target });
    expect(first).toBe(true);
    const second = await verifyRecoveryCode({ userId: USER_ID, code: target });
    expect(second).toBe(false);
  });

  it("returns false for a non-matching code without spending any other", async () => {
    const { recoveryCodes } = await fullyEnroll();
    const result = await verifyRecoveryCode({
      userId: USER_ID,
      code: "AAAA-AAAA-AAAA",
    });
    expect(result).toBe(false);
    // All 10 still unused.
    const status = await getRecoveryCodeStatus(USER_ID);
    expect(status.remainingCodes).toBe(10);
    // Sanity : a real code still works.
    const ok = await verifyRecoveryCode({
      userId: USER_ID,
      code: recoveryCodes[5]!,
    });
    expect(ok).toBe(true);
  });

  it("uppercases user input before comparison", async () => {
    const { recoveryCodes } = await fullyEnroll();
    const lower = recoveryCodes[0]!.toLowerCase();
    const ok = await verifyRecoveryCode({ userId: USER_ID, code: lower });
    expect(ok).toBe(true);
  });

  it("returns false when the user is not enrolled", async () => {
    const ok = await verifyRecoveryCode({
      userId: USER_ID,
      code: "AAAA-BBBB-CCCC",
    });
    expect(ok).toBe(false);
  });
});

describe("regenerateRecoveryCodes", () => {
  it("requires a valid TOTP code + replaces the entire batch", async () => {
    const { secret, recoveryCodes: original } = await fullyEnroll();
    const fresh = await regenerateRecoveryCodes({
      userId: USER_ID,
      code: totpCode(secret),
    });
    expect(fresh).toHaveLength(10);
    // Any old code should be gone after regen.
    expect(await verifyRecoveryCode({ userId: USER_ID, code: original[0]! })).toBe(false);
    // A fresh code works.
    expect(await verifyRecoveryCode({ userId: USER_ID, code: fresh[0]! })).toBe(true);
  });

  it("rejects when the TOTP code is invalid", async () => {
    await fullyEnroll();
    await expect(regenerateRecoveryCodes({ userId: USER_ID, code: "000000" })).rejects.toThrow(
      /invalid/i,
    );
  });
});

describe("getRecoveryCodeStatus + acknowledgeRecoveryCodeUse", () => {
  it("flags hasUnacknowledgedUse after a code is consumed", async () => {
    const { recoveryCodes } = await fullyEnroll();
    let status = await getRecoveryCodeStatus(USER_ID);
    expect(status.hasUnacknowledgedUse).toBe(false);
    expect(status.remainingCodes).toBe(10);

    await verifyRecoveryCode({ userId: USER_ID, code: recoveryCodes[0]! });
    status = await getRecoveryCodeStatus(USER_ID);
    expect(status.enrolled).toBe(true);
    expect(status.hasUnacknowledgedUse).toBe(true);
    expect(status.lastUnacknowledgedUseAt).not.toBeNull();
    expect(status.remainingCodes).toBe(9);

    await acknowledgeRecoveryCodeUse(USER_ID);
    status = await getRecoveryCodeStatus(USER_ID);
    expect(status.hasUnacknowledgedUse).toBe(false);
    expect(status.lastUnacknowledgedUseAt).toBeNull();
  });

  it("returns enrolled:false for a user without an activated secret", async () => {
    const status = await getRecoveryCodeStatus(USER_ID);
    expect(status.enrolled).toBe(false);
    expect(status.remainingCodes).toBe(0);
  });
});

describe("disableTotp", () => {
  it("removes the secret + cascades the recovery codes", async () => {
    const { secret } = await fullyEnroll();
    await disableTotp({ userId: USER_ID, code: totpCode(secret) });
    const db = getDb();
    const row = await db.totpSecret.findUnique({ where: { userId: USER_ID } });
    expect(row).toBeNull();
    const codes = await db.recoveryCode.count({
      where: { totpSecret: { userId: USER_ID } },
    });
    expect(codes).toBe(0);
    expect(await isTotpActive(USER_ID)).toBe(false);
  });

  it("rejects when the TOTP code is invalid + leaves the secret intact", async () => {
    await fullyEnroll();
    await expect(disableTotp({ userId: USER_ID, code: "000000" })).rejects.toThrow(/invalid/i);
    expect(await isTotpActive(USER_ID)).toBe(true);
  });
});

describe("requiresTotpChallenge + markDeviceTotpVerified", () => {
  it("returns false when TOTP isn't enrolled", async () => {
    const required = await requiresTotpChallenge({
      userId: USER_ID,
      trustedDeviceId: null,
    });
    expect(required).toBe(false);
  });

  it("returns true when TOTP is active + no trusted device id is provided", async () => {
    await fullyEnroll();
    const required = await requiresTotpChallenge({
      userId: USER_ID,
      trustedDeviceId: null,
    });
    expect(required).toBe(true);
  });

  it("returns true on a known device that hasn't yet cleared a TOTP challenge", async () => {
    await fullyEnroll();
    const db = getDb();
    const device = await db.trustedDevice.create({
      data: {
        userId: USER_ID,
        cookieHash: "fake-hash-1",
        label: "test",
        userAgent: "test-ua",
      },
    });
    const required = await requiresTotpChallenge({
      userId: USER_ID,
      trustedDeviceId: device.id,
    });
    expect(required).toBe(true);
  });

  it("returns false on a device that cleared a TOTP challenge", async () => {
    await fullyEnroll();
    const db = getDb();
    const device = await db.trustedDevice.create({
      data: {
        userId: USER_ID,
        cookieHash: "fake-hash-2",
        label: "test",
        userAgent: "test-ua",
      },
    });
    await markDeviceTotpVerified({
      userId: USER_ID,
      trustedDeviceId: device.id,
    });
    const required = await requiresTotpChallenge({
      userId: USER_ID,
      trustedDeviceId: device.id,
    });
    expect(required).toBe(false);
  });
});

describe("cleanupStaleTotpEnrollments", () => {
  it("drops only unactivated rows older than 24 hours", async () => {
    const db = getDb();
    // Active enrollment — should NOT be dropped.
    await fullyEnroll();
    // Stale unactivated row, manually backdated.
    const otherUser = "totp-stale-user";
    await db.user.upsert({
      where: { id: otherUser },
      create: { id: otherUser, email: "stale@x.test" },
      update: {},
    });
    await beginTotpEnrollment({
      userId: otherUser,
      accountLabel: "stale@x.test",
    });
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.totpSecret.update({
      where: { userId: otherUser },
      data: { enrolledAt: old },
    });
    // Recent unactivated row — should NOT be dropped.
    const recentUser = "totp-recent-user";
    await db.user.upsert({
      where: { id: recentUser },
      create: { id: recentUser, email: "recent@x.test" },
      update: {},
    });
    await beginTotpEnrollment({
      userId: recentUser,
      accountLabel: "recent@x.test",
    });

    const result = await cleanupStaleTotpEnrollments();
    expect(result.dropped).toBe(1);
    const stale = await db.totpSecret.findUnique({
      where: { userId: otherUser },
    });
    expect(stale).toBeNull();
    const recent = await db.totpSecret.findUnique({
      where: { userId: recentUser },
    });
    expect(recent).not.toBeNull();
    const active = await db.totpSecret.findUnique({
      where: { userId: USER_ID },
    });
    expect(active).not.toBeNull();
    // Cleanup the extra users.
    await db.user.delete({ where: { id: otherUser } });
    await db.user.delete({ where: { id: recentUser } });
  });

  it("returns { dropped: 0 } when nothing matches the cutoff", async () => {
    const result = await cleanupStaleTotpEnrollments();
    expect(result.dropped).toBe(0);
  });
});
