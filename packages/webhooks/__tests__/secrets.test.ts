import { describe, expect, it } from "vitest";
import {
  mintSecret,
  hashSecret,
  signBody,
  buildDeliveryHeaders,
  computeIdempotencyKey,
} from "../src/server/secrets";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_IDEMPOTENCY_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
} from "../src/contracts/index";

describe("mintSecret", () => {
  it("returns a plaintext starting with whsec_", () => {
    const { plaintext } = mintSecret();
    expect(plaintext).toMatch(/^whsec_/);
  });

  it("returns a valid SHA-256 hex hash", () => {
    const { hash } = mintSecret();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique secrets on each call", () => {
    const a = mintSecret();
    const b = mintSecret();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashSecret", () => {
  it("matches the hash produced by mintSecret", () => {
    const { plaintext, hash } = mintSecret();
    expect(hashSecret(plaintext)).toBe(hash);
  });

  it("is deterministic", () => {
    expect(hashSecret("test-secret")).toBe(hashSecret("test-secret"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashSecret("secret-a")).not.toBe(hashSecret("secret-b"));
  });
});

describe("signBody", () => {
  const base = { secret: "whsec_test", timestamp: 1700000000, body: '{"type":"test"}' };

  it("produces v1=<hex> format", () => {
    const sig = signBody(base);
    expect(sig).toMatch(/^v1=[0-9a-f]+$/);
  });

  it("is deterministic with same inputs", () => {
    expect(signBody(base)).toBe(signBody(base));
  });

  it("differs with different timestamps", () => {
    const other = signBody({ ...base, timestamp: 1700000001 });
    expect(signBody(base)).not.toBe(other);
  });

  it("differs with different secrets", () => {
    const other = signBody({ ...base, secret: "whsec_other" });
    expect(signBody(base)).not.toBe(other);
  });

  it("differs with different bodies", () => {
    const other = signBody({ ...base, body: '{"type":"other"}' });
    expect(signBody(base)).not.toBe(other);
  });
});

describe("buildDeliveryHeaders", () => {
  const input = {
    secret: "whsec_test",
    body: '{"type":"test","data":{}}',
    deliveryId: "del-123",
    idempotencyKey: "idem-456",
    eventType: "rbac.role-created",
  };

  it("includes all 5 required headers", () => {
    const headers = buildDeliveryHeaders(input);
    expect(headers).toHaveProperty(WEBHOOK_SIGNATURE_HEADER);
    expect(headers).toHaveProperty(WEBHOOK_TIMESTAMP_HEADER);
    expect(headers).toHaveProperty(WEBHOOK_DELIVERY_ID_HEADER);
    expect(headers).toHaveProperty(WEBHOOK_IDEMPOTENCY_HEADER);
    expect(headers).toHaveProperty(WEBHOOK_EVENT_TYPE_HEADER);
  });

  it("includes Content-Type and User-Agent", () => {
    const headers = buildDeliveryHeaders(input);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("monark-webhooks/1");
  });

  it("sets correct delivery id and idempotency key", () => {
    const headers = buildDeliveryHeaders(input);
    expect(headers[WEBHOOK_DELIVERY_ID_HEADER]).toBe("del-123");
    expect(headers[WEBHOOK_IDEMPOTENCY_HEADER]).toBe("idem-456");
    expect(headers[WEBHOOK_EVENT_TYPE_HEADER]).toBe("rbac.role-created");
  });

  it("uses provided timestamp when given", () => {
    const headers = buildDeliveryHeaders({ ...input, timestamp: 1700000000 });
    expect(headers[WEBHOOK_TIMESTAMP_HEADER]).toBe("1700000000");
  });

  it("uses current unix timestamp when none provided", () => {
    const before = Math.floor(Date.now() / 1000);
    const headers = buildDeliveryHeaders(input);
    const after = Math.floor(Date.now() / 1000);
    const ts = Number(headers[WEBHOOK_TIMESTAMP_HEADER]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("signature matches signBody output for same timestamp", () => {
    const ts = 1700000000;
    const headers = buildDeliveryHeaders({ ...input, timestamp: ts });
    const expected = signBody({ secret: input.secret, timestamp: ts, body: input.body });
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(expected);
  });
});

describe("computeIdempotencyKey", () => {
  const base = {
    endpointId: "ep-1",
    eventType: "rbac.role-created",
    payload: { type: "rbac.role-created", roleKey: "admin" },
  };

  it("is deterministic", () => {
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey(base));
  });

  it("produces a 48-character hex string", () => {
    const key = computeIdempotencyKey(base);
    expect(key).toMatch(/^[0-9a-f]{48}$/);
  });

  it("differs when endpointId changes", () => {
    const other = computeIdempotencyKey({ ...base, endpointId: "ep-2" });
    expect(computeIdempotencyKey(base)).not.toBe(other);
  });

  it("differs when eventType changes", () => {
    const other = computeIdempotencyKey({ ...base, eventType: "rbac.role-deleted" });
    expect(computeIdempotencyKey(base)).not.toBe(other);
  });

  it("uses correlationId when available", () => {
    const withCorr = computeIdempotencyKey({ ...base, correlationId: "corr-1" });
    const withOtherCorr = computeIdempotencyKey({ ...base, correlationId: "corr-2" });
    expect(withCorr).not.toBe(withOtherCorr);
  });

  it("falls back to payload hash when no correlationId", () => {
    const a = computeIdempotencyKey({ ...base, payload: { x: 1 } });
    const b = computeIdempotencyKey({ ...base, payload: { x: 2 } });
    expect(a).not.toBe(b);
  });

  it("correlationId takes precedence over payload differences", () => {
    const a = computeIdempotencyKey({ ...base, correlationId: "same", payload: { x: 1 } });
    const b = computeIdempotencyKey({ ...base, correlationId: "same", payload: { x: 2 } });
    expect(a).toBe(b);
  });
});
