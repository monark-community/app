import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { on } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";

// The auth user the mocked admin client will hand back. Each case sets
// this before calling `provisionOAuthUser`, which is the only way the
// function learns anything about the identity : it deliberately reads
// from Supabase rather than trusting its caller, so the mock is where
// the fixture lives.
let currentAuthUser: Record<string, unknown> | null = null;

vi.mock("../../src/server/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) =>
          currentAuthUser && currentAuthUser["id"] === id
            ? { data: { user: currentAuthUser }, error: null }
            : { data: { user: null }, error: { message: "not found" } },
      },
    },
  }),
}));

import { assertCanUnlinkProvider, provisionOAuthUser } from "../../src/server/oauth";
import { dismissTotpOnboarding, getTotpOnboardingStatus } from "../../src/server/totp-onboarding";
import { registerAuthFeatureFlags } from "../../src/server/flags";
import type { UserSignedUpEvent } from "../../src/contracts/events";

const USER_ID = "oauth-user-1";
const OTHER_ID = "oauth-user-2";

function githubUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER_ID,
    email: "ada@example.com",
    email_confirmed_at: "2026-01-02T03:04:05Z",
    user_metadata: {
      full_name: "Ada Lovelace",
      avatar_url: "https://avatars.githubusercontent.com/u/2",
      email_verified: true,
    },
    app_metadata: { provider: "github", providers: ["github"] },
    ...overrides,
  };
}

beforeEach(() => {
  currentAuthUser = githubUser();
});

afterEach(async () => {
  _resetHandlersForTesting();
  const db = getDb();
  await truncate(db, ["User"]);
});

describe("provisionOAuthUser — first social sign-in", () => {
  it("creates the shadow User row Supabase never told us about", async () => {
    const result = await provisionOAuthUser({ userId: USER_ID });

    expect(result).toEqual({ ok: true, created: true, provider: "github" });
    const row = await getDb().user.findUnique({ where: { id: USER_ID } });
    expect(row?.email).toBe("ada@example.com");
    expect(row?.displayName).toBe("Ada Lovelace");
    expect(row?.avatarUrl).toBe("https://avatars.githubusercontent.com/u/2");
    // The provider vouched for the address, so the account starts
    // verified ; there's no confirmation email to click.
    expect(row?.emailVerifiedAt).not.toBeNull();
  });

  it("emits user.signed-up carrying the provider", async () => {
    const handler = vi.fn();
    on<UserSignedUpEvent>("user.signed-up", handler);

    await provisionOAuthUser({ userId: USER_ID });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      type: "user.signed-up",
      userId: USER_ID,
      email: "ada@example.com",
      provider: "github",
    });
  });

  it("stores the locale the browser asked for", async () => {
    await provisionOAuthUser({ userId: USER_ID, localePreference: "fr" });
    const row = await getDb().user.findUnique({ where: { id: USER_ID } });
    expect(row?.localePreference).toBe("fr");
  });
});

describe("provisionOAuthUser — repeat sign-ins", () => {
  it("is idempotent : a second call neither duplicates nor re-announces", async () => {
    const handler = vi.fn();
    on<UserSignedUpEvent>("user.signed-up", handler);

    await provisionOAuthUser({ userId: USER_ID });
    const second = await provisionOAuthUser({ userId: USER_ID });

    expect(second).toEqual({ ok: true, created: false, provider: "github" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await getDb().user.count()).toBe(1);
  });

  it("backfills a profile field that is still empty", async () => {
    await getDb().user.create({
      data: { id: USER_ID, email: "ada@example.com", displayName: null, avatarUrl: null },
    });

    await provisionOAuthUser({ userId: USER_ID });

    const row = await getDb().user.findUnique({ where: { id: USER_ID } });
    expect(row?.displayName).toBe("Ada Lovelace");
  });

  it("never overwrites a name the user chose themselves", async () => {
    await getDb().user.create({
      data: { id: USER_ID, email: "ada@example.com", displayName: "Countess" },
    });

    await provisionOAuthUser({ userId: USER_ID });

    const row = await getDb().user.findUnique({ where: { id: USER_ID } });
    expect(row?.displayName).toBe("Countess");
  });

  it("verifies an account that signed up by password and never clicked the link", async () => {
    await getDb().user.create({
      data: { id: USER_ID, email: "ada@example.com", emailVerifiedAt: null },
    });

    await provisionOAuthUser({ userId: USER_ID });

    const row = await getDb().user.findUnique({ where: { id: USER_ID } });
    expect(row?.emailVerifiedAt).not.toBeNull();
  });
});

describe("provisionOAuthUser — refusals", () => {
  it("refuses an identity the provider hasn't verified", async () => {
    currentAuthUser = githubUser({
      email_confirmed_at: null,
      user_metadata: { full_name: "Ada", email_verified: false },
    });

    const result = await provisionOAuthUser({ userId: USER_ID });

    expect(result).toEqual({ ok: false, reason: "email-unverified" });
    expect(await getDb().user.count()).toBe(0);
  });

  it("refuses an identity with no email at all", async () => {
    currentAuthUser = githubUser({ email: null });

    const result = await provisionOAuthUser({ userId: USER_ID });

    expect(result).toEqual({ ok: false, reason: "no-email" });
    expect(await getDb().user.count()).toBe(0);
  });

  it("refuses when another user row already owns the address", async () => {
    await getDb().user.create({ data: { id: OTHER_ID, email: "ada@example.com" } });

    const result = await provisionOAuthUser({ userId: USER_ID });

    expect(result).toEqual({ ok: false, reason: "email-collision" });
    expect(await getDb().user.findUnique({ where: { id: USER_ID } })).toBeNull();
  });

  it("catches a collision that differs only in casing", async () => {
    // `signUpUser` persists whatever the signup form submitted, so a
    // password account can hold "Ada@Example.com" while Supabase hands
    // us the lowercased form.
    await getDb().user.create({ data: { id: OTHER_ID, email: "Ada@Example.com" } });

    const result = await provisionOAuthUser({ userId: USER_ID });

    expect(result).toEqual({ ok: false, reason: "email-collision" });
  });

  it("throws when the auth user has vanished from Supabase", async () => {
    currentAuthUser = null;
    await expect(provisionOAuthUser({ userId: USER_ID })).rejects.toThrow();
  });
});

describe("assertCanUnlinkProvider", () => {
  // `readIdentityStatus` reads the identity list off the auth user, so
  // the fixture is what decides what the account can afford to lose.
  function withIdentities(providers: string[]) {
    currentAuthUser = githubUser({
      identities: providers.map((provider) => ({ provider })),
    });
  }

  it("refuses a provider that isn't linked at all", async () => {
    withIdentities(["email"]);
    await expect(assertCanUnlinkProvider({ userId: USER_ID, provider: "github" })).resolves.toEqual(
      {
        ok: false,
        reason: "not-linked",
      },
    );
  });

  it("refuses the last remaining method", async () => {
    // Social-only account, one provider, no password : unlinking would
    // leave nothing our own UI would render as a way in.
    withIdentities(["github"]);
    await expect(assertCanUnlinkProvider({ userId: USER_ID, provider: "github" })).resolves.toEqual(
      {
        ok: false,
        reason: "last-method",
      },
    );
  });

  it("allows it when a password remains", async () => {
    withIdentities(["github", "email"]);
    await expect(assertCanUnlinkProvider({ userId: USER_ID, provider: "github" })).resolves.toEqual(
      {
        ok: true,
      },
    );
  });

  it("throws nothing and refuses cleanly when the auth user is gone", async () => {
    // readIdentityStatus degrades to "no methods" on an admin-API
    // failure, which lands on not-linked rather than a crash.
    currentAuthUser = null;
    await expect(assertCanUnlinkProvider({ userId: USER_ID, provider: "github" })).resolves.toEqual(
      {
        ok: false,
        reason: "not-linked",
      },
    );
  });
});

describe("TOTP onboarding prompt", () => {
  // The flag defaults to on, but a flag only has a default once it's
  // registered ; an unregistered key resolves to false.
  beforeEach(() => {
    registerAuthFeatureFlags();
  });

  it("prompts a verified user who hasn't enrolled", async () => {
    await provisionOAuthUser({ userId: USER_ID });
    await expect(getTotpOnboardingStatus(USER_ID)).resolves.toEqual({ shouldPrompt: true });
  });

  it("stays quiet until the email is verified", async () => {
    // Provisioning stamps verification, so build the unverified row
    // directly — this is the state a password signup sits in before the
    // confirmation link is clicked.
    await getDb().user.create({
      data: { id: USER_ID, email: "ada@example.com", emailVerifiedAt: null },
    });
    await expect(getTotpOnboardingStatus(USER_ID)).resolves.toEqual({ shouldPrompt: false });
  });

  it("stays quiet once dismissed", async () => {
    await provisionOAuthUser({ userId: USER_ID });
    await dismissTotpOnboarding(USER_ID);
    await expect(getTotpOnboardingStatus(USER_ID)).resolves.toEqual({ shouldPrompt: false });
  });

  it("is idempotent : dismissing twice is not an error", async () => {
    await provisionOAuthUser({ userId: USER_ID });
    await dismissTotpOnboarding(USER_ID);
    await dismissTotpOnboarding(USER_ID);
    await expect(getTotpOnboardingStatus(USER_ID)).resolves.toEqual({ shouldPrompt: false });
  });

  it("stays quiet for a user that doesn't exist", async () => {
    await expect(getTotpOnboardingStatus("nobody")).resolves.toEqual({ shouldPrompt: false });
  });
});
