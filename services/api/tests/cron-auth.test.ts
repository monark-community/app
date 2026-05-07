import { describe, expect, it } from "vitest"
import { evaluateCronAuth } from "../src/lib/cron-auth"

describe("evaluateCronAuth", () => {
  it("returns ok=true when the bearer matches the configured secret", () => {
    const result = evaluateCronAuth({
      authorizationHeader: "Bearer abc-123",
      cronSecret: "abc-123",
    })
    expect(result).toEqual({ ok: true })
  })

  it("returns not-configured when CRON_SECRET is empty / unset", () => {
    expect(
      evaluateCronAuth({ authorizationHeader: "Bearer x", cronSecret: "" }),
    ).toEqual({ ok: false, reason: "not-configured" })
    expect(
      evaluateCronAuth({
        authorizationHeader: "Bearer x",
        cronSecret: undefined,
      }),
    ).toEqual({ ok: false, reason: "not-configured" })
    expect(
      evaluateCronAuth({ authorizationHeader: "Bearer x", cronSecret: null }),
    ).toEqual({ ok: false, reason: "not-configured" })
  })

  it("returns unauthorized when the bearer doesn't match", () => {
    expect(
      evaluateCronAuth({
        authorizationHeader: "Bearer wrong",
        cronSecret: "right",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" })
  })

  it("returns unauthorized when the header is missing entirely", () => {
    expect(
      evaluateCronAuth({
        authorizationHeader: null,
        cronSecret: "right",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" })
    expect(
      evaluateCronAuth({
        authorizationHeader: undefined,
        cronSecret: "right",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" })
  })

  it("does not treat the bare secret as a valid bearer", () => {
    // A scheduler that drops the "Bearer " prefix is misconfigured ;
    // we should reject so the misconfig surfaces as a 401 rather than
    // accidentally working.
    expect(
      evaluateCronAuth({
        authorizationHeader: "right",
        cronSecret: "right",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" })
  })

  it("is case-sensitive on the 'Bearer' prefix", () => {
    expect(
      evaluateCronAuth({
        authorizationHeader: "bearer right",
        cronSecret: "right",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" })
  })
})
