import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { REDACT_PATHS } from "../src/log";

// Verifies the redaction path list scrubs every kind of credential
// the production code can put into a structured log record. Pino's
// own redaction is well-tested ; what we own is the path *list*, so
// the assertions here drive a real pino instance configured with
// the production paths and read every line back through a captured
// Writable destination.
//
// We pass a synchronous destination so the assertion runs against
// what's already written without race-y `setImmediate` waits.

function buildCapturingLogger(): {
  logger: pino.Logger;
  lines: () => Array<Record<string, unknown>>;
} {
  const buf: string[] = [];
  const dest = new Writable({
    write(chunk, _encoding, callback) {
      buf.push(chunk.toString());
      callback();
    },
  });
  const logger = pino(
    {
      level: "info",
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    },
    dest,
  );
  return {
    logger,
    lines: () =>
      buf
        .join("")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("common/log REDACT_PATHS", () => {
  it("redacts every credential-flavoured field one level deep via *.field", () => {
    const { logger, lines } = buildCapturingLogger();
    // Production logs always nest the payload (`req.…`, `session.…`,
    // `webhook.…`, `payload.…`) so the `*.field` wildcard catches
    // them. The matcher does NOT cover root-level keys ; if a caller
    // wraps credentials at the root, they pass through, which is
    // why every `logger.info(...)` call should structure under a
    // namespace. This test pins that contract.
    logger.info(
      {
        payload: {
          userId: "u1",
          password: "hunter2",
          token: "raw-jwt",
          accessToken: "raw-access",
          refreshToken: "raw-refresh",
          access_token: "snake-access",
          refresh_token: "snake-refresh",
          passwordHash: "argon2$abc",
          secret: "rotation-key",
          secretCipher: "ciphertext",
          cookieValue: "deviceCookie123",
          cookieHash: "h$abc",
          tokenHash: "h$xyz",
        },
      },
      "credential payload",
    );
    const [record] = lines();
    expect(record).toBeDefined();
    const payload = record!.payload as Record<string, unknown>;
    expect(payload.userId).toBe("u1");
    expect(payload.password).toBe("[REDACTED]");
    expect(payload.token).toBe("[REDACTED]");
    expect(payload.accessToken).toBe("[REDACTED]");
    expect(payload.refreshToken).toBe("[REDACTED]");
    expect(payload.access_token).toBe("[REDACTED]");
    expect(payload.refresh_token).toBe("[REDACTED]");
    expect(payload.passwordHash).toBe("[REDACTED]");
    expect(payload.secret).toBe("[REDACTED]");
    expect(payload.secretCipher).toBe("[REDACTED]");
    expect(payload.cookieValue).toBe("[REDACTED]");
    expect(payload.cookieHash).toBe("[REDACTED]");
    expect(payload.tokenHash).toBe("[REDACTED]");
  });

  it("redacts request headers that carry session credentials", () => {
    const { logger, lines } = buildCapturingLogger();
    logger.info(
      {
        req: {
          method: "POST",
          url: "/api/x",
          headers: {
            authorization: "Bearer raw-jwt",
            cookie: "sb-token=abc",
            "set-cookie": "sb-token=abc",
            "x-supabase-auth": "supa-jwt",
            "x-api-key": "k_123",
            "x-csrf-token": "csrf",
            "proxy-authorization": "Basic abcd",
            // Non-sensitive header that should stay visible.
            "user-agent": "Mozilla/5.0",
          },
        },
      },
      "incoming request",
    );
    const [record] = lines();
    const req = record!.req as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
    expect(headers["set-cookie"]).toBe("[REDACTED]");
    expect(headers["x-supabase-auth"]).toBe("[REDACTED]");
    expect(headers["x-api-key"]).toBe("[REDACTED]");
    expect(headers["x-csrf-token"]).toBe("[REDACTED]");
    expect(headers["proxy-authorization"]).toBe("[REDACTED]");
    expect(headers["user-agent"]).toBe("Mozilla/5.0");
  });

  it("does not censor unrelated keys that happen to share a substring", () => {
    const { logger, lines } = buildCapturingLogger();
    // Keys that contain a redacted substring but aren't on the path
    // list should pass through unchanged. Pino's matcher is exact on
    // the path, not a substring match, so e.g. `passwordless` stays.
    logger.info(
      {
        passwordless: true,
        tokenized: { type: "card" },
        secretly: "fine",
      },
      "lookalike keys",
    );
    const [record] = lines();
    expect(record!.passwordless).toBe(true);
    expect(record!.tokenized).toEqual({ type: "card" });
    expect(record!.secretly).toBe("fine");
  });

  it("redacts at one level of nesting via the *.field wildcard", () => {
    const { logger, lines } = buildCapturingLogger();
    logger.info(
      {
        session: { password: "hunter2", userId: "u1" },
        device: { token: "raw" },
      },
      "nested credentials",
    );
    const [record] = lines();
    const session = record!.session as Record<string, unknown>;
    const device = record!.device as Record<string, unknown>;
    expect(session.password).toBe("[REDACTED]");
    expect(session.userId).toBe("u1");
    expect(device.token).toBe("[REDACTED]");
  });
});
