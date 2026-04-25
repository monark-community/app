import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { authenticator } from "otplib"
import qrcode from "qrcode"
import { emit, ConflictError, ValidationError } from "@monark/common"
import { getDb } from "@monark/db"
import { isEnabled } from "@monark/feature-flags/server"
import type {
  TotpDisabledEvent,
  TotpEnabledEvent,
  TotpRecoveryCodeUsedEvent,
} from "../contracts/events"
import { decryptSecret, encryptSecret } from "./crypto"

const ISSUER = "Monark"
const RECOVERY_CODE_COUNT = 10
// A ±1 window (30 sec either side) catches mild client clock skew without
// opening the door to brute force beyond what the 6-digit code already allows.
authenticator.options = { window: 1 }

export type TotpStatus =
  | { enrolled: false }
  | { enrolled: true; activatedAt: Date | null; remainingRecoveryCodes: number }

export async function getTotpStatus(userId: string): Promise<TotpStatus> {
  const db = getDb()
  const secret = await db.totpSecret.findUnique({
    where: { userId },
    include: {
      recoveryCodes: { where: { usedAt: null } },
    },
  })
  if (!secret) return { enrolled: false }
  return {
    enrolled: true,
    activatedAt: secret.activatedAt,
    remainingRecoveryCodes: secret.recoveryCodes.length,
  }
}

export async function isTotpActive(userId: string): Promise<boolean> {
  const db = getDb()
  const secret = await db.totpSecret.findUnique({
    where: { userId },
    select: { activatedAt: true },
  })
  return Boolean(secret?.activatedAt)
}

// Returns the secret + a QR data URL pointing at `otpauth://...`. Replaces any
// previous in-progress enrollment (activatedAt null) atomically; activated
// enrollments must be explicitly disabled first.
export async function beginTotpEnrollment(input: {
  userId: string
  accountLabel: string
}): Promise<{ secret: string; qrDataUrl: string }> {
  const db = getDb()
  const existing = await db.totpSecret.findUnique({ where: { userId: input.userId } })
  if (existing?.activatedAt) {
    throw new ConflictError("TOTP is already active; disable it before re-enrolling.")
  }

  const secret = authenticator.generateSecret()
  const otpauth = authenticator.keyuri(input.accountLabel, ISSUER, secret)
  const qrDataUrl = await qrcode.toDataURL(otpauth, { width: 240, margin: 1 })
  const encrypted = encryptSecret(secret)

  if (existing) {
    await db.$transaction([
      db.recoveryCode.deleteMany({ where: { totpSecretId: existing.id } }),
      db.totpSecret.delete({ where: { id: existing.id } }),
    ])
  }
  await db.totpSecret.create({
    data: {
      userId: input.userId,
      secretCipher: Uint8Array.from(encrypted.cipher),
      secretIv: Uint8Array.from(encrypted.iv),
      secretTag: Uint8Array.from(encrypted.tag),
    },
  })

  return { secret, qrDataUrl }
}

function generateRecoveryCode(): string {
  // 12 hex chars (6 bytes) split into XXXX-XXXX-XXXX.
  const raw = randomBytes(6).toString("hex").toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

// Called once the user has entered the first 6-digit code from their
// authenticator. On success, activates the enrollment and mints 10 one-time
// recovery codes (plaintext returned exactly once).
export async function confirmTotpEnrollment(input: {
  userId: string
  code: string
}): Promise<{ recoveryCodes: string[] }> {
  const db = getDb()
  const secret = await db.totpSecret.findUnique({ where: { userId: input.userId } })
  if (!secret) {
    throw new ValidationError("No enrollment in progress; start with beginTotpEnrollment.")
  }
  if (secret.activatedAt) {
    throw new ConflictError("TOTP is already active.")
  }

  const plaintext = decryptSecret({
    cipher: Buffer.from(secret.secretCipher),
    iv: Buffer.from(secret.secretIv),
    tag: Buffer.from(secret.secretTag),
  })
  const ok = authenticator.check(input.code.trim(), plaintext)
  if (!ok) {
    throw new ValidationError("That code is invalid. Check the time on your device.")
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)))

  await db.$transaction([
    db.totpSecret.update({
      where: { id: secret.id },
      data: { activatedAt: new Date() },
    }),
    db.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ totpSecretId: secret.id, codeHash })),
    }),
  ])

  const event: TotpEnabledEvent = {
    type: "totp.enabled",
    userId: input.userId,
    occurredAt: new Date(),
  }
  await emit(event)

  return { recoveryCodes }
}

export async function verifyTotpCode(input: {
  userId: string
  code: string
}): Promise<boolean> {
  const db = getDb()
  const secret = await db.totpSecret.findUnique({ where: { userId: input.userId } })
  if (!secret?.activatedAt) return false
  const plaintext = decryptSecret({
    cipher: Buffer.from(secret.secretCipher),
    iv: Buffer.from(secret.secretIv),
    tag: Buffer.from(secret.secretTag),
  })
  return authenticator.check(input.code.trim(), plaintext)
}

// Consumes one unused recovery code (bcrypt-compared). Returns true if the
// code matched and was just now marked used.
export async function verifyRecoveryCode(input: {
  userId: string
  code: string
}): Promise<boolean> {
  const db = getDb()
  const secret = await db.totpSecret.findUnique({
    where: { userId: input.userId },
    include: { recoveryCodes: { where: { usedAt: null } } },
  })
  if (!secret) return false

  const candidate = input.code.trim().toUpperCase()
  for (const row of secret.recoveryCodes) {
    const match = await bcrypt.compare(candidate, row.codeHash)
    if (!match) continue
    const updated = await db.recoveryCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    if (updated.count === 0) return false
    const remaining = secret.recoveryCodes.length - 1
    const event: TotpRecoveryCodeUsedEvent = {
      type: "totp.recovery-code-used",
      userId: input.userId,
      remainingCodes: remaining,
      occurredAt: new Date(),
    }
    await emit(event)
    return true
  }
  return false
}

export async function regenerateRecoveryCodes(input: {
  userId: string
  code: string
}): Promise<string[]> {
  const ok = await verifyTotpCode(input)
  if (!ok) throw new ValidationError("Invalid TOTP code.")

  const db = getDb()
  const secret = await db.totpSecret.findUnique({ where: { userId: input.userId } })
  if (!secret) throw new ValidationError("TOTP is not enrolled.")

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)))
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { totpSecretId: secret.id } }),
    db.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ totpSecretId: secret.id, codeHash })),
    }),
  ])
  return recoveryCodes
}

// Requires a current TOTP code to confirm intent. Password re-entry is
// enforced upstream by the calling server action (which has the Supabase
// client in its scope).
export async function disableTotp(input: {
  userId: string
  code: string
}): Promise<void> {
  const ok = await verifyTotpCode(input)
  if (!ok) throw new ValidationError("Invalid TOTP code.")
  const db = getDb()
  await db.totpSecret.delete({ where: { userId: input.userId } })
  const event: TotpDisabledEvent = {
    type: "totp.disabled",
    userId: input.userId,
    triggeredBy: "user",
    occurredAt: new Date(),
  }
  await emit(event)
}

// True when the user has activated TOTP AND the current device hasn't
// already cleared a TOTP challenge (or the trust-devices flag is off).
export async function requiresTotpChallenge(input: {
  userId: string
  trustedDeviceId: string | null
}): Promise<boolean> {
  const active = await isTotpActive(input.userId)
  if (!active) return false

  const trustDevicesFlag = await isEnabled("auth.totp-trust-devices", {
    userId: input.userId,
  })
  if (!trustDevicesFlag) return true
  if (!input.trustedDeviceId) return true

  const db = getDb()
  const device = await db.trustedDevice.findFirst({
    where: {
      id: input.trustedDeviceId,
      userId: input.userId,
      revokedAt: null,
    },
    select: { totpVerifiedAt: true },
  })
  return !device?.totpVerifiedAt
}

// Stamped once the user clears a TOTP challenge on this device. Subsequent
// sign-ins from the same device skip the challenge.
export async function markDeviceTotpVerified(input: {
  userId: string
  trustedDeviceId: string
}): Promise<void> {
  const db = getDb()
  await db.trustedDevice.updateMany({
    where: {
      id: input.trustedDeviceId,
      userId: input.userId,
      revokedAt: null,
    },
    data: { totpVerifiedAt: new Date() },
  })
}
