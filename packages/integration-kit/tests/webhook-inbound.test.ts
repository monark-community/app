import { afterEach, describe, expect, it, vi } from "vitest";
import type * as CommonModule from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";

// The inbound-webhook handler factory + the constant-time secret compare. The
// secrets substrate (org signing secret) and the event bus are mocked so the
// handler's decision table is exercised in isolation: not-configured (404),
// bad-signature (401), unmodeled-delivery ack (202), emit (202), emit-failure
// swallowed (still 202).

const { mockGetSecret, mockEmit } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockEmit: vi.fn(),
}));
vi.mock("@monark/secrets/server", () => ({
  getSecretValue: (...args: unknown[]) => mockGetSecret(...args),
}));
vi.mock("@monark/common", async (importOriginal) => {
  const actual = await importOriginal<typeof CommonModule>();
  return {
    ...actual,
    emit: (...args: unknown[]) => mockEmit(...args),
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import { constantTimeEquals, defineInboundWebhook } from "../src/server/webhook";

afterEach(() => vi.clearAllMocks());

describe("constantTimeEquals", () => {
  it("is true for equal strings, false for different or length-mismatched ones", () => {
    expect(constantTimeEquals("secret-token", "secret-token")).toBe(true);
    expect(constantTimeEquals("secret-token", "secret-tokeX")).toBe(false);
    expect(constantTimeEquals("short", "longer-value")).toBe(false); // no throw on length mismatch
    expect(constantTimeEquals("", "")).toBe(true);
  });
});

describe("defineInboundWebhook", () => {
  const EVENT: DomainEvent = {
    type: "demo.thing",
    occurredAt: new Date(),
  } as unknown as DomainEvent;

  const build = (over: Partial<Parameters<typeof defineInboundWebhook>[0]> = {}) =>
    defineInboundWebhook({
      secretKey: "demo.webhook-secret",
      verify: () => true,
      map: () => EVENT,
      label: "demo",
      ...over,
    });
  const params = {
    organizationId: "org-1",
    eventName: "push",
    signature: "sig",
    rawBody: Buffer.from("{}"),
    payload: {},
  };

  it("404s when the org hasn't configured a secret", async () => {
    mockGetSecret.mockResolvedValue(null);
    expect(await build()(params)).toEqual({ status: 404, error: "not-configured" });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("401s when the signature doesn't verify", async () => {
    mockGetSecret.mockResolvedValue("the-secret");
    const handler = build({ verify: () => false });
    expect(await handler(params)).toEqual({ status: 401, error: "invalid-signature" });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("acks (202, not emitted) a delivery the integration doesn't model", async () => {
    mockGetSecret.mockResolvedValue("the-secret");
    const handler = build({ map: () => null });
    expect(await handler(params)).toEqual({ status: 202, emitted: false });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("emits the mapped event and returns 202", async () => {
    mockGetSecret.mockResolvedValue("the-secret");
    mockEmit.mockResolvedValue(undefined);
    expect(await build()(params)).toEqual({ status: 202, emitted: true });
    expect(mockEmit).toHaveBeenCalledWith(EVENT);
    // The verifier receives the raw body + resolved secret + signature.
    const verify = vi.fn(() => true);
    await build({ verify })(params);
    expect(verify).toHaveBeenCalledWith(params.rawBody, "the-secret", params.signature);
  });

  it("swallows an emit failure and still acks 202 (delivery isn't retried)", async () => {
    mockGetSecret.mockResolvedValue("the-secret");
    mockEmit.mockRejectedValue(new Error("bus down"));
    expect(await build()(params)).toEqual({ status: 202, emitted: true });
  });
});
