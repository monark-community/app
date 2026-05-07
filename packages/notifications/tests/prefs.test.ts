import { describe, expect, it } from "vitest"
import { resolveChannelEnabled, type PrefRow } from "../src/server/prefs"

describe("notifications/prefs.resolveChannelEnabled", () => {
  it("uses the registry default when no override row exists", () => {
    expect(
      resolveChannelEnabled({
        kind: "auth.new-device",
        channel: "IN_APP",
        rows: [],
      }),
    ).toBe(true)
    expect(
      resolveChannelEnabled({
        kind: "account.deletion-canceled",
        channel: "EMAIL",
        rows: [],
      }),
    ).toBe(false)
  })

  it("respects an explicit override row", () => {
    const rows: PrefRow[] = [{ category: "ACCOUNT", channel: "IN_APP", enabled: false }]
    expect(
      resolveChannelEnabled({
        kind: "account.deletion-scheduled",
        channel: "IN_APP",
        rows,
      }),
    ).toBe(false)
  })

  it("forces SECURITY x EMAIL on regardless of an opt-out row", () => {
    // Even with a SECURITY/EMAIL=false row, requiredEmail forces it back on.
    const rows: PrefRow[] = [{ category: "SECURITY", channel: "EMAIL", enabled: false }]
    expect(
      resolveChannelEnabled({
        kind: "auth.password-changed",
        channel: "EMAIL",
        rows,
      }),
    ).toBe(true)
  })

  it("forces does NOT apply to non-EMAIL channels of SECURITY", () => {
    const rows: PrefRow[] = [{ category: "SECURITY", channel: "IN_APP", enabled: false }]
    expect(
      resolveChannelEnabled({
        kind: "auth.password-changed",
        channel: "IN_APP",
        rows,
      }),
    ).toBe(false)
  })

  it("ignores rows for unrelated categories", () => {
    const rows: PrefRow[] = [{ category: "DIGEST", channel: "EMAIL", enabled: true }]
    expect(
      resolveChannelEnabled({
        kind: "account.deletion-scheduled",
        channel: "EMAIL",
        rows,
      }),
    ).toBe(true) // registry default for ACCOUNT/EMAIL
  })

  it("returns false for a channel not declared in the kind's defaults", () => {
    // account.email-changed only declares IN_APP defaults; EMAIL has no
    // default entry, so resolution falls through to false.
    expect(
      resolveChannelEnabled({
        kind: "account.email-changed",
        channel: "EMAIL",
        rows: [],
      }),
    ).toBe(false)
  })
})
