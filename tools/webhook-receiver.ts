/**
 * Mock webhook receiver for manual testing + the e2e suite. Boots a
 * tiny HTTP server that captures every incoming request, optionally
 * verifies the HMAC signature, and exposes a JSON inbox for callers
 * to inspect.
 *
 * Manual smoke (run from the repo root) :
 *
 *   pnpm tsx tools/webhook-receiver.ts --port 4123
 *
 * Then in /admin/webhooks → New endpoint → URL = http://localhost:4123/hook
 * → pick a few subscriptions → Create. Trigger one of the events
 * (e.g. flip a feature flag) and the receiver's stdout shows the
 * incoming payload + headers ; `curl http://localhost:4123/inbox`
 * returns every captured request as JSON for offline inspection.
 *
 * For the e2e spec, the receiver is booted in a child process and the
 * test polls `/inbox?since=<timestamp>` to wait for the delivery.
 *
 * Verification mode : pass `--secret <plaintext>` and the receiver
 * responds 401 to any request whose `Webhook-Signature` doesn't match
 * `v1=hex hmac sha256(secret, "<timestamp>.<body>")`. This mirrors the
 * production receiver flow and lets the e2e assert the signing path
 * end-to-end.
 *
 * Endpoints :
 *   POST /hook                — capture path. Returns 200 with `{ ok: true }`
 *                               when accepted, 401 when signature verification
 *                               fails (verification mode only), 500 when the
 *                               operator passes `--fail-once` for retry tests.
 *   GET  /inbox               — every captured request as JSON.
 *   GET  /inbox?since=<unix>  — only captures with `receivedAt >= since`.
 *   DELETE /inbox             — clears the inbox.
 *   GET  /healthz             — `{ ok: true }`. Lets a test wait for boot.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseArgs } from "node:util";

type CapturedRequest = {
  receivedAt: number;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  // The parsed body, if it was JSON. Saves the test from re-parsing.
  json: unknown | null;
  // Verification outcome when in verify mode ; null otherwise.
  signatureValid: boolean | null;
};

const inbox: CapturedRequest[] = [];
let failNextOnce = false;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifySignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signatureHeader: string;
}): boolean {
  if (!input.signatureHeader.startsWith("v1=")) return false;
  const provided = Buffer.from(input.signatureHeader.slice(3), "hex");
  const computed = Buffer.from(
    createHmac("sha256", input.secret).update(`${input.timestamp}.${input.body}`).digest("hex"),
    "hex",
  );
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

function jsonResponse(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function isVerificationFailure(captured: CapturedRequest): boolean {
  return captured.signatureValid === false;
}

async function handleHook(
  req: IncomingMessage,
  res: ServerResponse,
  config: { secret: string | null; failOnce: boolean; quiet: boolean },
): Promise<void> {
  const body = await readBody(req);
  let parsed: unknown = null;
  try {
    parsed = body.length > 0 ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  let signatureValid: boolean | null = null;
  if (config.secret !== null) {
    const sig = req.headers["webhook-signature"];
    const ts = req.headers["webhook-timestamp"];
    if (typeof sig === "string" && typeof ts === "string") {
      signatureValid = verifySignature({
        secret: config.secret,
        timestamp: ts,
        body,
        signatureHeader: sig,
      });
    } else {
      signatureValid = false;
    }
  }

  const captured: CapturedRequest = {
    receivedAt: Date.now(),
    method: req.method ?? "POST",
    url: req.url ?? "/hook",
    headers: req.headers as Record<string, string | string[] | undefined>,
    body,
    json: parsed,
    signatureValid,
  };
  inbox.push(captured);

  if (!config.quiet) {
    const status = isVerificationFailure(captured) ? "REJECTED" : "ACCEPTED";
    process.stdout.write(
      `[receiver] ${status} ${req.method} ${req.url} ${
        captured.headers["webhook-event-type"] ?? "?"
      } ${body.length}b\n`,
    );
  }

  if (isVerificationFailure(captured)) {
    jsonResponse(res, 401, { ok: false, reason: "invalid signature" });
    return;
  }

  if (config.failOnce && failNextOnce) {
    failNextOnce = false;
    if (!config.quiet) {
      process.stdout.write("[receiver] returning 500 once for retry test\n");
    }
    jsonResponse(res, 500, { ok: false, reason: "synthetic failure" });
    return;
  }

  jsonResponse(res, 200, {
    ok: true,
    idempotencyKey: captured.headers["webhook-delivery-idempotency-key"] ?? null,
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "4123" },
      secret: { type: "string" },
      "fail-once": { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
    },
  });
  const port = Number(values.port);
  const secret = values.secret ?? null;
  const config = {
    secret,
    failOnce: values["fail-once"] ?? false,
    quiet: values.quiet ?? false,
  };
  if (config.failOnce) failNextOnce = true;

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/healthz") {
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.startsWith("/inbox")) {
      const queryIdx = url.indexOf("?");
      const params = new URLSearchParams(queryIdx >= 0 ? url.slice(queryIdx + 1) : "");
      const since = Number(params.get("since") ?? "0");
      const filtered = since > 0 ? inbox.filter((c) => c.receivedAt >= since) : inbox;
      jsonResponse(res, 200, { count: filtered.length, captures: filtered });
      return;
    }
    if (req.method === "DELETE" && url === "/inbox") {
      inbox.length = 0;
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST") {
      await handleHook(req, res, config);
      return;
    }
    jsonResponse(res, 404, { ok: false, reason: "no such route" });
  });

  server.listen(port, "127.0.0.1", () => {
    if (!config.quiet) {
      process.stdout.write(`[receiver] listening on http://127.0.0.1:${port}\n`);
      process.stdout.write(
        `[receiver] mode: ${config.secret ? "verify-signatures" : "capture-only"}${config.failOnce ? " + fail-next-once" : ""}\n`,
      );
      process.stdout.write(`[receiver] POST /hook  GET /inbox  DELETE /inbox\n`);
    }
  });

  // Graceful shutdown for child-process e2e harness usage. SIGTERM
  // from the test process flushes the inbox to stdout if non-empty,
  // then exits.
  const shutdown = () => {
    if (!config.quiet && inbox.length > 0) {
      process.stdout.write(`[receiver] shutting down with ${inbox.length} captured request(s)\n`);
    }
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[receiver] fatal: ${String(err)}\n`);
  process.exit(1);
});
