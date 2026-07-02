import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@monark/common";

// One-time-use email-action token. Currently only minted for the
// "revoke this device" link in `auth.new-device` emails ; the same
// helper is intentionally generic so other one-click affordances
// (unsubscribe, approve-magic-link, …) can reuse it.
//
// Threat model :
//   - Token must not be forgeable without `EMAIL_ACTION_SECRET`.
//   - Token must encode an absolute expiry the server checks (the
//     email is the only audit trail ; once an attacker has the URL
//     they shouldn't be able to use it forever).
//   - Token must encode WHICH user + WHICH resource (deviceId) so the
//     server can verify ownership before acting.
//   - The action itself (`revokeTrustedDevice`) is idempotent, so we
//     don't need single-use enforcement — the second click on an
//     already-revoked device is a no-op. If we add non-idempotent
//     actions later, this helper grows a nonce table.
//
// Token format : `base64url(JSON({ p:'revoke-device', u:userId,
// d:deviceId, e:expiresUnixSec })) + "." + base64url(hmacSha256(body,
// secret))`. JSON is verbose but readable in logs ; the email URL is
// already long.
//
// Secret resolution : `process.env.EMAIL_ACTION_SECRET` when present,
// otherwise a fixed dev default with a one-time `logger.warn`. Tests
// pass an explicit secret via the helper input.

const DEV_SECRET = "monark-email-action-secret-DEV-ONLY-please-set-EMAIL_ACTION_SECRET";
let warnedDevSecret = false;

function resolveSecret(explicit?: string): string {
  if (explicit && explicit.length > 0) return explicit;
  const fromEnv = process.env["EMAIL_ACTION_SECRET"];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    logger.warn(
      "EMAIL_ACTION_SECRET is unset ; falling back to the dev default. " +
        "An attacker who knows the source can forge revoke tokens for any user. " +
        "Set a 32+ char random value in production.",
    );
  }
  return DEV_SECRET;
}

type TokenPurpose = "revoke-device";

type TokenBody = {
  p: TokenPurpose;
  u: string;
  d: string;
  e: number;
};

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64UrlDecode(raw: string): Buffer | null {
  try {
    return Buffer.from(raw, "base64url");
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(body).digest());
}

export type MintEmailActionTokenInput = {
  purpose: TokenPurpose;
  userId: string;
  deviceId: string;
  /** Token validity in milliseconds. 7 days by default (matches the email's relevance window). */
  ttlMs?: number;
  /** Explicit secret ; tests use this. Falls back to env / dev default otherwise. */
  secret?: string;
  /** Clock override ; tests use this. Defaults to Date.now(). */
  now?: number;
};

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function mintEmailActionToken(input: MintEmailActionTokenInput): string {
  const secret = resolveSecret(input.secret);
  const nowMs = input.now ?? Date.now();
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  const body: TokenBody = {
    p: input.purpose,
    u: input.userId,
    d: input.deviceId,
    e: Math.floor((nowMs + ttl) / 1000),
  };
  const payload = base64UrlEncode(Buffer.from(JSON.stringify(body), "utf8"));
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export type VerifyEmailActionTokenInput = {
  token: string;
  expectedPurpose: TokenPurpose;
  secret?: string;
  now?: number;
};

export type VerifyEmailActionTokenResult =
  | { ok: true; userId: string; deviceId: string }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" | "wrong-purpose" };

/**
 * Verify a token minted by `mintEmailActionToken`. Returns a tagged
 * result so the calling tRPC procedure can pick the right user-facing
 * error message (`/auth/revoke-device/<token>` renders "link invalid",
 * "link expired", or "device revoked").
 *
 * Signature comparison uses `timingSafeEqual` to keep the verify
 * runtime constant regardless of where the signatures diverge — a
 * remote attacker who can time the response shouldn't be able to
 * recover the secret one byte at a time.
 */
export function verifyEmailActionToken(
  input: VerifyEmailActionTokenInput,
): VerifyEmailActionTokenResult {
  const dot = input.token.indexOf(".");
  if (dot <= 0 || dot === input.token.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const payload = input.token.slice(0, dot);
  const sig = input.token.slice(dot + 1);
  const secret = resolveSecret(input.secret);
  const expectedSig = sign(payload, secret);

  // Constant-time compare. Length mismatch short-circuits to false (the
  // Buffer.from below would throw on mismatched lengths inside
  // timingSafeEqual otherwise).
  const got = base64UrlDecode(sig);
  const want = base64UrlDecode(expectedSig);
  if (!got || !want || got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reason: "bad-signature" };
  }

  const body = base64UrlDecode(payload);
  if (!body) return { ok: false, reason: "malformed" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "malformed" };
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.p !== "string" ||
    typeof obj.u !== "string" ||
    typeof obj.d !== "string" ||
    typeof obj.e !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (obj.p !== input.expectedPurpose) {
    return { ok: false, reason: "wrong-purpose" };
  }
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  if (obj.e <= nowSec) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, userId: obj.u, deviceId: obj.d };
}
