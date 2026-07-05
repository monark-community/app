import { createHash, randomBytes } from "node:crypto";
import { UAParser } from "ua-parser-js";
import { emit, logger } from "@monark/common";
import { getDb, type Prisma } from "@monark/db";
import type {
  TrustedDeviceAddedEvent,
  TrustedDeviceRevokedEvent,
  TrustedDevicesAllRevokedEvent,
} from "../contracts/events";
import { getSupabaseAdmin } from "./supabase-admin";

export type TrustedDeviceRow = Prisma.TrustedDeviceGetPayload<Record<string, never>>;

// 400 days is the browser-enforced maximum for Max-Age on modern Chrome/Safari.
export const DEVICE_COOKIE_NAME = "monark_device_id";
export const DEVICE_COOKIE_MAX_AGE_CAP_SECONDS = 60 * 60 * 24 * 400;
// Backwards-compat re-export. The cap is the right semantic name now
// that the per-user `trustedDeviceTtlDays` preference picks the
// effective Max-Age ; keep the old constant exported so callers that
// haven't been migrated still resolve.
export const DEVICE_COOKIE_MAX_AGE_SECONDS = DEVICE_COOKIE_MAX_AGE_CAP_SECONDS;

// Allowed values for `User.trustedDeviceTtlDays`. The mutation Zod
// schema + UI Select both lean on this so they can't drift apart.
export const DEVICE_TTL_OPTIONS_DAYS = [30, 60, 90] as const;
export type DeviceTtlDays = (typeof DEVICE_TTL_OPTIONS_DAYS)[number];

// Default applied when a row's value is unreadable / out of range. 90
// is the longest UI option ; also the schema's column default for new
// users. Matches the "be generous on fallback" rule so a transient DB
// glitch doesn't silently shorten everyone's trust window.
const DEFAULT_TTL_DAYS = 90;

// Clamp helper for cases where a DB row carries a value that pre-dates
// the current option list (or a future schema change). Always returns
// something the browser will respect — 400-day ceiling enforced
// because that's the RFC 6265bis cap on the cookie's `Max-Age` ; the
// UI option list is narrower than this cap by design.
export function clampDeviceTtlDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TTL_DAYS;
  return Math.min(Math.max(Math.trunc(value), 1), 400);
}

function freshExpiry(ttlDays: number): Date {
  return new Date(Date.now() + clampDeviceTtlDays(ttlDays) * 24 * 60 * 60 * 1000);
}

/**
 * The next three helpers are pure and exported so the unit suite can
 * import them directly from `tests/`. The package's exports map only
 * opens `./server` so external consumers can't reach these.
 */
export function hashCookieValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintCookieValue(): string {
  return randomBytes(32).toString("base64url");
}

// Turns "Mozilla/5.0 ..." into a short human label like "Chrome on macOS".
// Falls back to "Unknown device" when parsing yields nothing usable.
export function labelFromUserAgent(ua: string): string {
  const parsed = new UAParser(ua).getResult();
  const browser = parsed.browser.name;
  const os = parsed.os.name;
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "Unknown device";
}

export type ClientHints = {
  model?: string;
  platformVersion?: string;
  fullVersionList?: string;
};

export type RecognizeOrRegisterInput = {
  userId: string;
  userAgent: string | null;
  ip: string | null;
  // ISO-3166-1 alpha-2 country code resolved from the platform's edge
  // geo header (Vercel `x-vercel-ip-country`, Cloudflare `cf-ipcountry`,
  // CloudFront `cloudfront-viewer-country`). Null when no proxy + no
  // GeoIP lookup is wired ; persisted as-is so the row reflects what
  // the platform told us at sign-in time.
  country?: string | null;
  // High-entropy User-Agent Client Hints captured by the web layer
  // when the browser sends them (modern Chrome / Edge after the
  // middleware's Accept-CH header lands ; null on browsers that don't
  // implement UA-CH). Persisted to the row so toView can prefer the
  // real device model over the UA-reduced placeholder.
  clientHints?: ClientHints | null;
  // Existing cookie value (raw) if the request carried one; pass null/undefined
  // when first-time.
  existingCookieValue: string | null;
  // Current Supabase session id for this sign-in. When provided, we record
  // it on the device so a later `revokeTrustedDevice` can do a per-device
  // signOut instead of a global one. Optional because not every caller has
  // it cheaply available.
  supabaseSessionId?: string | null;
};

export type RecognizeOrRegisterOutput = {
  device: TrustedDeviceRow;
  isNew: boolean;
  // Set when `isNew` or when the existing record was revoked / belongs to a
  // different user; caller must refresh the cookie in that case.
  rawCookieValue: string | null;
  // Effective trust TTL in seconds for THIS device, sourced from the
  // user's `trustedDeviceTtlDays` preference and clamped to the
  // browser's 400-day cookie ceiling. The web layer plumbs this into
  // the cookie's `Max-Age` so the cookie + DB row die in lockstep
  // (matches the sliding-expiry semantics ; refreshed on every
  // recognised sign-in).
  ttlSeconds: number;
};

// Looks up (or creates) the trusted device record tied to this user + cookie.
//
// The cookie is opaque; we compare its SHA-256 hash against `cookieHash`. The
// cookie is scoped per-user: if the same raw cookie value matched another
// user's record, we'd only find ours via the compound lookup. In practice,
// cookies are minted per-session so collisions across users require a leak.
export async function recognizeOrRegister(
  input: RecognizeOrRegisterInput,
): Promise<RecognizeOrRegisterOutput> {
  const db = getDb();
  const userAgent = input.userAgent ?? "";
  const now = new Date();

  // Per-user trust window. One small lookup ; the User row is hot in
  // the planner cache because sign-in just used it. `null` falls back
  // to 400 so a request that arrives before the migration's column
  // default is observed (single-test edge cases) doesn't crash.
  const userPrefs = await db.user.findUnique({
    where: { id: input.userId },
    select: { trustedDeviceTtlDays: true },
  });
  const ttlDays = clampDeviceTtlDays(userPrefs?.trustedDeviceTtlDays ?? DEFAULT_TTL_DAYS);
  const ttlSeconds = ttlDays * 24 * 60 * 60;

  if (input.existingCookieValue) {
    const hash = hashCookieValue(input.existingCookieValue);
    const match = await db.trustedDevice.findFirst({
      where: {
        userId: input.userId,
        cookieHash: hash,
        revokedAt: null,
        // A cookie pointing at an expired row was already untrustworthy
        // on the cookie side (Max-Age would have culled it) ; rejecting
        // it here closes the cookie-survives-row-expiry edge.
        expiresAt: { gt: now },
      },
    });
    if (match) {
      const updated = await db.trustedDevice.update({
        where: { id: match.id },
        data: {
          lastSeenAt: now,
          // Sliding expiry : an actively-used device keeps rolling its
          // trust forward, matching the way the cookie's Max-Age gets
          // refreshed on every recognised request.
          expiresAt: freshExpiry(ttlDays),
          lastSeenIp: input.ip ?? match.lastSeenIp,
          // Refresh country on every recognized sign-in so a roaming
          // user's location keeps up. Treat null from the caller as
          // "no fresh signal" rather than "clear the field".
          country: input.country ?? match.country,
          // Same null-as-no-signal handling for clientHints : a
          // browser that stops sending UA-CH after a profile change
          // shouldn't wipe the model we already learned.
          clientHints: input.clientHints ?? match.clientHints ?? undefined,
        },
      });
      await recordDeviceSession(updated.id, input.supabaseSessionId);
      return { device: updated, isNew: false, rawCookieValue: null, ttlSeconds };
    }
  }

  const rawCookieValue = mintCookieValue();
  const cookieHash = hashCookieValue(rawCookieValue);
  const created = await db.trustedDevice.create({
    data: {
      userId: input.userId,
      cookieHash,
      label: labelFromUserAgent(userAgent),
      userAgent,
      firstSeenIp: input.ip,
      lastSeenIp: input.ip,
      country: input.country ?? null,
      clientHints: input.clientHints ?? undefined,
      expiresAt: freshExpiry(ttlDays),
    },
  });
  await recordDeviceSession(created.id, input.supabaseSessionId);

  const event: TrustedDeviceAddedEvent = {
    type: "trusted-device.added",
    userId: created.userId,
    deviceId: created.id,
    userAgent,
    occurredAt: now,
  };
  await emit(event);

  return { device: created, isNew: true, rawCookieValue, ttlSeconds };
}

// Idempotent — if we've already linked this Supabase session to this device,
// the unique constraint on supabaseSessionId silently no-ops.
async function recordDeviceSession(
  deviceId: string,
  supabaseSessionId: string | null | undefined,
): Promise<void> {
  if (!supabaseSessionId) return;
  const db = getDb();
  await db.deviceSession
    .upsert({
      where: { supabaseSessionId },
      create: { deviceId, supabaseSessionId },
      update: {},
    })
    .catch((err) => {
      logger.warn(
        { err, deviceId, supabaseSessionId },
        "deviceSession upsert failed; revoke will fall back to global signOut",
      );
    });
}

export async function listTrustedDevices(userId: string): Promise<TrustedDeviceRow[]> {
  const db = getDb();
  return db.trustedDevice.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
}

// Returns the device id matching the cookie the caller passes in (if any).
// Used by /account so the trusted-devices list can highlight "this device".
// Caller hashes nothing themselves ; we hash here so the cookie stays on the
// server and never round-trips back to client memory.
export async function findCurrentDeviceId(input: {
  userId: string;
  cookieValue: string | null;
}): Promise<string | null> {
  if (!input.cookieValue) return null;
  const db = getDb();
  const hash = hashCookieValue(input.cookieValue);
  const match = await db.trustedDevice.findFirst({
    where: {
      userId: input.userId,
      cookieHash: hash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return match?.id ?? null;
}

export async function revokeTrustedDevice(input: {
  userId: string;
  deviceId: string;
  scope?: "user" | "admin";
  /**
   * Set by `revokeAllTrustedDevices` so downstream notification
   * subscribers can suppress the per-device email during a bulk sweep
   * (the sweep emits a single `trusted-devices.all-revoked` instead).
   */
  bulk?: boolean;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const updated = await db.trustedDevice.updateMany({
    where: { id: input.deviceId, userId: input.userId, revokedAt: null },
    data: { revokedAt: now },
  });
  if (updated.count === 0) return;

  // Pull every Supabase session we know about for this device and admin-
  // signOut each. Best-effort: if Supabase rejects (network, stale id) we
  // log + continue, and the row is still cleared from DeviceSession so it
  // won't be tried again.
  const sessions = await db.deviceSession.findMany({
    where: { deviceId: input.deviceId },
    select: { id: true, supabaseSessionId: true },
  });
  if (sessions.length > 0) {
    const supabase = (() => {
      try {
        return getSupabaseAdmin();
      } catch (err) {
        logger.warn(
          { err, deviceId: input.deviceId },
          "supabase admin not configured; per-session revoke skipped",
        );
        return null;
      }
    })();
    if (supabase) {
      for (const session of sessions) {
        const adminAuth = supabase.auth.admin as unknown as {
          signOut?: (sessionId: string) => Promise<{ error: unknown }>;
        };
        if (typeof adminAuth.signOut !== "function") {
          logger.warn(
            { deviceId: input.deviceId },
            "supabase.auth.admin.signOut not available in this client version; falling back to leaving session intact",
          );
          break;
        }
        const { error } = await adminAuth.signOut(session.supabaseSessionId);
        if (error) {
          logger.warn(
            { err: error, supabaseSessionId: session.supabaseSessionId },
            "supabase admin signOut failed during device revoke",
          );
        }
      }
    }
    await db.deviceSession.deleteMany({
      where: { id: { in: sessions.map((s) => s.id) } },
    });
  }

  const event: TrustedDeviceRevokedEvent = {
    type: "trusted-device.revoked",
    userId: input.userId,
    deviceId: input.deviceId,
    scope: input.scope ?? "user",
    bulk: input.bulk ?? false,
    occurredAt: now,
  };
  await emit(event);
}

// Emergency lockout: revokes every non-revoked TrustedDevice for the user
// in sequence so each row's per-device Supabase admin signOut runs. The
// user's local Supabase cookie is still intact after this returns ; the
// caller is responsible for clearing it (the web service action does
// `supabase.auth.signOut({ scope: "local" })` immediately after).
//
// Emits `trusted-devices.all-revoked` once at the end with the actual
// count revoked ; individual `trusted-device.revoked` events still fire
// per row inside revokeTrustedDevice (with `bulk: true`) for audit /
// per-device subscribers. The notifications module's per-device
// subscriber skips the bulk rows, so the user gets one "every session
// ended" email instead of N "device X revoked" receipts.
//
// Returns the number of devices successfully revoked. A best-effort count ;
// individual failures are swallowed so one bad row doesn't strand the others.
export async function revokeAllTrustedDevices(input: {
  userId: string;
  scope?: "user" | "admin";
}): Promise<number> {
  const db = getDb();
  const rows = await db.trustedDevice.findMany({
    where: { userId: input.userId, revokedAt: null },
    select: { id: true },
  });
  let count = 0;
  for (const row of rows) {
    try {
      await revokeTrustedDevice({
        userId: input.userId,
        deviceId: row.id,
        scope: input.scope,
        bulk: true,
      });
      count += 1;
    } catch (err) {
      logger.warn(
        { err, deviceId: row.id, userId: input.userId },
        "revokeAllTrustedDevices: per-device revoke failed; continuing",
      );
    }
  }

  if (count > 0) {
    const event: TrustedDevicesAllRevokedEvent = {
      type: "trusted-devices.all-revoked",
      userId: input.userId,
      count,
      scope: input.scope ?? "user",
      occurredAt: new Date(),
    };
    await emit(event);
  }

  return count;
}
