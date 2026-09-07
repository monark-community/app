import { afterEach, describe, expect, it } from "vitest";
import {
  configuredOAuthProviders,
  extractOAuthProfile,
  type OAuthAuthUserLike,
} from "../src/server/oauth";
import { isOAuthProvider, OAUTH_PROVIDERS } from "../src/contracts/oauth";

// Shapes copied from what each provider actually puts in
// `user_metadata` ; the differences between them are the whole reason
// `extractOAuthProfile` exists, so the fixtures are deliberately
// verbatim rather than normalized.
const GOOGLE: OAuthAuthUserLike = {
  id: "u-google",
  email: "Ada@Example.com",
  email_confirmed_at: "2026-01-02T03:04:05Z",
  user_metadata: {
    full_name: "Ada Lovelace",
    name: "Ada Lovelace",
    picture: "https://lh3.googleusercontent.com/a/ada",
    email_verified: true,
  },
  app_metadata: { provider: "google", providers: ["google"] },
};

const GITHUB_NO_REAL_NAME: OAuthAuthUserLike = {
  id: "u-github",
  email: "grace@example.com",
  email_confirmed_at: "2026-01-02T03:04:05Z",
  user_metadata: {
    user_name: "ghopper",
    avatar_url: "https://avatars.githubusercontent.com/u/1",
  },
  app_metadata: { provider: "github", providers: ["github"] },
};

const AZURE: OAuthAuthUserLike = {
  id: "u-azure",
  email: "alan@example.com",
  user_metadata: { name: "Alan Turing", email_verified: true },
  app_metadata: { provider: "azure", providers: ["azure"] },
};

describe("auth/oauth.extractOAuthProfile", () => {
  it("lowercases the email so it matches what Supabase stores", () => {
    expect(extractOAuthProfile(GOOGLE).email).toBe("ada@example.com");
  });

  it("prefers full_name, then name, then the GitHub handle", () => {
    expect(extractOAuthProfile(GOOGLE).displayName).toBe("Ada Lovelace");
    expect(extractOAuthProfile(AZURE).displayName).toBe("Alan Turing");
    expect(extractOAuthProfile(GITHUB_NO_REAL_NAME).displayName).toBe("ghopper");
  });

  it("reads the avatar from picture (Google) or avatar_url (GitHub)", () => {
    expect(extractOAuthProfile(GOOGLE).avatarUrl).toBe("https://lh3.googleusercontent.com/a/ada");
    expect(extractOAuthProfile(GITHUB_NO_REAL_NAME).avatarUrl).toBe(
      "https://avatars.githubusercontent.com/u/1",
    );
  });

  it("treats email_confirmed_at as verification on its own", () => {
    // GitHub's metadata carries no `email_verified` key at all ; the
    // Supabase-side stamp is the only signal available.
    expect(extractOAuthProfile(GITHUB_NO_REAL_NAME).emailVerified).toBe(true);
  });

  it("treats user_metadata.email_verified as verification on its own", () => {
    // Azure fixture has no `email_confirmed_at`.
    expect(extractOAuthProfile(AZURE).emailVerified).toBe(true);
  });

  it("reports unverified when neither signal is present", () => {
    const profile = extractOAuthProfile({
      id: "u",
      email: "nope@example.com",
      user_metadata: { email_verified: false },
      app_metadata: { provider: "github" },
    });
    expect(profile.emailVerified).toBe(false);
  });

  it("returns a null email rather than an empty string", () => {
    expect(extractOAuthProfile({ id: "u", email: "   " }).email).toBeNull();
    expect(extractOAuthProfile({ id: "u" }).email).toBeNull();
  });

  it("drops an avatar that isn't an http(s) URL", () => {
    // A `javascript:` or `data:` value here would end up in an <img
    // src> on every page that renders the user's avatar.
    const profile = extractOAuthProfile({
      id: "u",
      email: "a@b.test",
      user_metadata: { avatar_url: "javascript:alert(1)" },
    });
    expect(profile.avatarUrl).toBeNull();
  });

  it("clamps an overlong display name to the 80-char column ceiling", () => {
    const profile = extractOAuthProfile({
      id: "u",
      email: "a@b.test",
      user_metadata: { full_name: "x".repeat(500) },
    });
    expect(profile.displayName).toHaveLength(80);
  });

  it("ignores blank metadata strings instead of storing whitespace", () => {
    const profile = extractOAuthProfile({
      id: "u",
      email: "a@b.test",
      user_metadata: { full_name: "   ", name: "Real Name" },
    });
    expect(profile.displayName).toBe("Real Name");
  });

  it("falls back to the providers array when `provider` isn't one of ours", () => {
    // A password-first account that later linked GitHub reports
    // `provider: "email"` for the session that established it.
    const profile = extractOAuthProfile({
      id: "u",
      email: "a@b.test",
      app_metadata: { provider: "email", providers: ["email", "github"] },
    });
    expect(profile.provider).toBe("github");
  });

  it("falls back to the identities list when app_metadata says nothing", () => {
    const profile = extractOAuthProfile({
      id: "u",
      email: "a@b.test",
      identities: [{ provider: "azure" }],
    });
    expect(profile.provider).toBe("azure");
  });

  it("returns a null provider for an email-only account", () => {
    const profile = extractOAuthProfile({
      id: "u",
      email: "a@b.test",
      app_metadata: { provider: "email", providers: ["email"] },
    });
    expect(profile.provider).toBeNull();
  });

  it("survives an auth user with no metadata bags at all", () => {
    expect(() => extractOAuthProfile({ id: "u" })).not.toThrow();
  });
});

describe("auth/oauth.isOAuthProvider", () => {
  it("accepts every slug in the exported list", () => {
    for (const provider of OAUTH_PROVIDERS) {
      expect(isOAuthProvider(provider)).toBe(true);
    }
  });

  it("rejects providers we haven't wired (apple) and non-social ones (email)", () => {
    expect(isOAuthProvider("apple")).toBe(false);
    expect(isOAuthProvider("email")).toBe(false);
  });
});

describe("auth/oauth.configuredOAuthProviders", () => {
  const original = process.env.AUTH_OAUTH_PROVIDERS;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_OAUTH_PROVIDERS;
    else process.env.AUTH_OAUTH_PROVIDERS = original;
  });

  it("returns nothing when unset, so an unconfigured deploy shows no buttons", () => {
    delete process.env.AUTH_OAUTH_PROVIDERS;
    expect(configuredOAuthProviders()).toEqual([]);
  });

  it("parses a comma list, tolerating whitespace and casing", () => {
    process.env.AUTH_OAUTH_PROVIDERS = " Google , GITHUB ";
    expect(configuredOAuthProviders()).toEqual(["google", "github"]);
  });

  it("drops unknown slugs instead of passing them to signInWithOAuth", () => {
    process.env.AUTH_OAUTH_PROVIDERS = "google,myspace,apple";
    expect(configuredOAuthProviders()).toEqual(["google"]);
  });

  it("de-duplicates repeats", () => {
    process.env.AUTH_OAUTH_PROVIDERS = "azure,azure,azure";
    expect(configuredOAuthProviders()).toEqual(["azure"]);
  });
});
