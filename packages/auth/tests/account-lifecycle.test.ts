import { describe, expect, it } from "vitest";
import { buildAnonymizedEmail } from "../src/server/account-lifecycle";

describe("auth/account-lifecycle.buildAnonymizedEmail", () => {
  it("produces 'deleted-<uuid>@monark.invalid' shape", () => {
    const email = buildAnonymizedEmail();
    expect(email).toMatch(
      /^deleted-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@monark\.invalid$/i,
    );
  });

  it("uses the @monark.invalid domain — the filter in processExpiredDeletions depends on it", () => {
    expect(buildAnonymizedEmail().endsWith("@monark.invalid")).toBe(true);
  });

  it("never collides across many invocations (uuidv4 randomness)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(buildAnonymizedEmail());
    expect(seen.size).toBe(200);
  });
});
