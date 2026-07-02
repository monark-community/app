import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emit, on } from "@monark/common";
// `_resetHandlersForTesting` is not part of the package's public
// surface ; we import it from the events module directly so the
// test can sweep registrations between cases.
import { _resetHandlersForTesting } from "@monark/common/events";
import { emitPasswordChanged, emitSignedIn, emitSignedOut } from "../src/server/events";
import type {
  PasswordChangedEvent,
  UserSignedInEvent,
  UserSignedOutEvent,
} from "../src/contracts/events";

describe("auth/events emitters", () => {
  beforeEach(() => {
    // Stub timers so `occurredAt: new Date()` is deterministic. The
    // emitters all stamp the current time when they construct the
    // event ; pinning gives us a stable assertion target.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:34:56.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetHandlersForTesting();
  });

  it("emitSignedIn fires `user.signed-in` with the right shape", async () => {
    const handler = vi.fn();
    on<UserSignedInEvent>("user.signed-in", handler);
    await emitSignedIn({ userId: "u1", trustedDeviceId: "td1" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: "user.signed-in",
      userId: "u1",
      trustedDeviceId: "td1",
      occurredAt: new Date("2026-05-05T12:34:56.000Z"),
    });
  });

  it("emitSignedIn omits trustedDeviceId when not provided", async () => {
    const handler = vi.fn();
    on<UserSignedInEvent>("user.signed-in", handler);
    await emitSignedIn({ userId: "u1" });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user.signed-in",
        userId: "u1",
        // The optional field is preserved as undefined, not stamped
        // with a fake value.
        trustedDeviceId: undefined,
      }),
    );
  });

  it("emitSignedOut fires `user.signed-out` with the scope it was given", async () => {
    const handler = vi.fn();
    on<UserSignedOutEvent>("user.signed-out", handler);
    await emitSignedOut({ userId: "u1", scope: "global" });
    expect(handler).toHaveBeenCalledWith({
      type: "user.signed-out",
      userId: "u1",
      scope: "global",
      occurredAt: new Date("2026-05-05T12:34:56.000Z"),
    });
  });

  it("emitSignedOut respects local scope", async () => {
    const handler = vi.fn();
    on<UserSignedOutEvent>("user.signed-out", handler);
    await emitSignedOut({ userId: "u1", scope: "local" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ scope: "local" }));
  });

  it("emitPasswordChanged carries the triggeredBy reason", async () => {
    const handler = vi.fn();
    on<PasswordChangedEvent>("user.password-changed", handler);
    await emitPasswordChanged({ userId: "u1", triggeredBy: "user" });
    expect(handler).toHaveBeenCalledWith({
      type: "user.password-changed",
      userId: "u1",
      triggeredBy: "user",
      occurredAt: new Date("2026-05-05T12:34:56.000Z"),
    });
  });

  it("emitPasswordChanged distinguishes `user` vs `reset` triggers", async () => {
    const handler = vi.fn();
    on<PasswordChangedEvent>("user.password-changed", handler);
    await emitPasswordChanged({ userId: "u1", triggeredBy: "reset" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ triggeredBy: "reset" }));
  });

  it("emitting with no handlers registered is a clean no-op", async () => {
    // Passes through `emit` from @monark/common which already
    // exercises this path ; covered here to confirm the auth-side
    // wrappers don't add anything that would break it.
    await expect(emitSignedIn({ userId: "u1" })).resolves.toBeUndefined();
  });

  it("multiple subscribers all see the same emit", async () => {
    const a = vi.fn();
    const b = vi.fn();
    on<UserSignedInEvent>("user.signed-in", a);
    on<UserSignedInEvent>("user.signed-in", b);
    await emitSignedIn({ userId: "u1" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("auth events flow through the shared @monark/common bus (no auth-local registry)", async () => {
    // Smoke check : registering a handler via the common `on` and
    // emitting via the auth wrapper crosses the boundary.
    const handler = vi.fn();
    on<UserSignedInEvent>("user.signed-in", handler);
    await emit({
      type: "user.signed-in",
      userId: "direct",
      occurredAt: new Date(),
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: "direct" }));
    await emitSignedIn({ userId: "wrapped" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: "wrapped" }));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
