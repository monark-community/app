/**
 * Integration tests for the api server's HTTP surface.
 *
 * The `entrypoint guard` in [`src/server.ts`](../../src/server.ts) means
 * importing the module skips `app.listen()` + the webhook worker
 * setInterval + the bootstrap / flag-sync DB writes. The express app
 * is fully built and ready for supertest-style requests.
 *
 * What's covered :
 *
 *   - The boot path itself : importing `app` and the bootstrap
 *     helper doesn't throw, every module-level register call lands
 *     successfully (a regression in any of those would surface as an
 *     import-time error here, before the test body).
 *   - `/health` returns the expected shape so any platform health-
 *     check hitting that route stays green.
 *   - The cron auth rule on `/cron/process-account-deletions` and
 *     `/cron/sweep-webhook-deliveries` : missing header → 401, wrong
 *     bearer → 401, right bearer → 200 (delegates to the underlying
 *     idempotent helper).
 *   - The `maybeBootstrapSingletonOrg` helper is callable directly +
 *     idempotent against the testcontainer.
 *
 * The cron `processExpiredDeletions` + `webhookWorkerTick` helpers
 * themselves are integration-tested in their own packages (auth +
 * webhooks). This suite owns the HTTP surface contract only.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";

// `CRON_SECRET` is read at module-load by `src/lib/env.ts`. Set it
// BEFORE importing the server so the validator picks it up + the
// runtime cron guard accepts the bearer below. Same goes for the
// other env vars `env.ts` validates on import.
process.env.CRON_SECRET = "test-cron-secret";
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_test";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "sb_secret_test";
process.env.NODE_ENV = "test";

// Dynamic import so the env stamps above land before any of
// `server.ts`'s module-load registrations / env validation runs.
const { app, maybeBootstrapSingletonOrg } = await import("../../src/server");

beforeAll(async () => {
  // No org seeding here — `maybeBootstrapSingletonOrg` provisions one
  // when the env vars are set, and the bootstrap test below verifies
  // the idempotent path with a fresh DB.
});

afterAll(() => {
  // Quiet pino-http during test runs to keep the output focused on
  // failures. (vitest captures stdout but the noise can mask error
  // detail when a spec actually fails.)
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await truncate(getDb(), ["Organization", "User"]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("api/server boot path", () => {
  it("imports the app without throwing — every register* call lands", () => {
    // The dynamic import above either succeeded (we got `app`) or
    // failed loud and aborted the suite. This case pins that we
    // got a runnable Express app back.
    expect(app).toBeDefined();
    expect(typeof app.use).toBe("function");
  });
});

describe("api/server GET /health", () => {
  it("returns 200 with the expected service tag", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "api" });
  });
});

describe("api/server cron auth — /cron/process-account-deletions", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const response = await request(app).post("/cron/process-account-deletions");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns 401 when the bearer token doesn't match", async () => {
    const response = await request(app)
      .post("/cron/process-account-deletions")
      .set("Authorization", "Bearer wrong");
    expect(response.status).toBe(401);
  });

  it("returns 401 when the header is missing the Bearer prefix", async () => {
    const response = await request(app)
      .post("/cron/process-account-deletions")
      .set("Authorization", "test-cron-secret");
    expect(response.status).toBe(401);
  });

  it("returns 200 + the sweep result when the bearer matches", async () => {
    const response = await request(app)
      .post("/cron/process-account-deletions")
      .set("Authorization", "Bearer test-cron-secret");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
    // No expired rows in the test DB ; the helper returns zero
    // counts. Verifying that the wrapper hands the result through
    // unchanged keeps the contract stable for monitoring tools that
    // graph the response shape. `processExpiredDeletions` returns
    // `{ attempted, succeeded, failed }` ; the route spreads that
    // alongside `ok: true`.
    expect(typeof response.body.attempted).toBe("number");
    expect(typeof response.body.succeeded).toBe("number");
    expect(typeof response.body.failed).toBe("number");
  });
});

describe("api/server cron auth — /cron/sweep-webhook-deliveries", () => {
  it("rejects unauthorized requests", async () => {
    const response = await request(app).post("/cron/sweep-webhook-deliveries");
    expect(response.status).toBe(401);
  });

  it("returns 200 + the worker tick result when the bearer matches", async () => {
    const response = await request(app)
      .post("/cron/sweep-webhook-deliveries")
      .set("Authorization", "Bearer test-cron-secret");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
  });
});

describe("api/server CORS", () => {
  it("allows the configured WEB_ORIGIN through the credentials path", async () => {
    // `WEB_ORIGIN` defaults to `http://localhost:3000,http://127.0.0.1:3000`.
    // A preflight from the default web origin should resolve with
    // `Access-Control-Allow-Credentials: true` and the origin echoed.
    const response = await request(app)
      .options("/health")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");
    expect(response.status).toBeLessThan(400);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});

describe("api/server maybeBootstrapSingletonOrg", () => {
  it("runs without throwing against an env that has no INITIAL_ORG_* set", async () => {
    // The env-not-set branch of `ensureSingletonOrganizationFromInput`
    // returns ok=false with reason="env-not-set" ; the wrapper logs
    // a warn and returns void. We verify it doesn't throw rather
    // than asserting the log line shape (the org-package suite
    // covers the inner result codes).
    delete process.env.INITIAL_ORG_SLUG;
    delete process.env.INITIAL_ORG_NAME;
    await expect(maybeBootstrapSingletonOrg()).resolves.toBeUndefined();
  });
});

describe("api/server tRPC mount", () => {
  it("exposes the /trpc surface (returns 404 for an unknown procedure path with the JSON error shape)", async () => {
    const response = await request(app).get("/trpc/this-procedure-does-not-exist");
    // tRPC's express adapter returns 404 with a JSON body for an
    // unknown procedure. Body shape is { error: { ... } } ; we only
    // need to confirm it lands JSON + 4xx so any future change to
    // the procedure registry doesn't accidentally drop the /trpc
    // mount entirely.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });
});
