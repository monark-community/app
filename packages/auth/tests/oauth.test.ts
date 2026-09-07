import { afterEach, describe, expect, it } from "vitest";
import {
  configuredOAuthProviders,
  extractOAuthProfile,
  type OAuthAuthUserLike,
} from "../src/server/oauth";
import { isOAuthProvider, OAUTH_PROVIDERS } from "../src/contracts/oauth";

// The GitHub fixtures are copied verbatim from what the provider
// actually puts in `user_metadata` ; the variation between providers is
// the whole reason `extractOAuthProfile` exists. The generic cases are
// written as bare objects rather than named after a provider, because
// the extractor is deliberately provider-agnostic and adding a provider
// shouldn't require touching it.
const GITHUB: OAuthAuthUserLike = {
  id: "u-github",
  email: "Ada@Example.com",
  email_confirmed_at: "2026-01-02T03:04:05Z",
  user_metadata: {
    full_name: "Ada Lovelace",
    name: "Ada Lovelace",
    avatar_url: "https://avatars.githubusercontent.com/u/2",
    email_verified: true,
  },
  app_metadata: { provider: "github", providers: ["github"] },
};

// GitHub sends `user_name` instead of a real name when the profile
// hasn't set one, and no `email_verified` key at all.
const GITHUB_NO_REAL_NAME: OAuthAuthUserLike = {
  id: "u-github-2",
  email: "grace@example.com",
  email_confirmed_at: "2026-01-02T03:04:05Z",
  user_metadata: {
    user_name: "ghopper",
    avatar_url: "https://avatars.githubusercontent.com/u/1",
  },
  app_metadata: { provider: "github", providers: ["github"] },
};

// No `email_confirmed_at` : the provider's own `email_verified` claim in
// user metadata is the only verification signal available.
const METADATA_VERIFIED_ONLY: OAuthAuthUserLike = {
  id: "u-meta",
  email: "alan@example.com",
  user_metadata: { name: "Alan Turing", email_verified: true },
  app_metadata: { provider: "github", providers: ["github"] },
};

describe("auth/oauth.extractOAuthProfile", () => {
  it("lowercases the email so it matches what Supabase stores", () => {
    expect(extractOAuthProfile(GITHUB).email).toBe("ada@example.com");
  });

  it("prefers full_name, then name, then the provider handle", () => {
    expect(extractOAuthProfile(GITHUB).displayName).toBe("Ada Lovelace");
    expect(extractOAuthProfile(METADATA_VERIFIED_ONLY).displayName).toBe("Alan Turing");
    expect(extractOAuthProfile(GITHUB_NO_REAL_NAME).displayName).toBe("ghopper");
  });

  it("reads the avatar from avatar_url, falling back to picture", () => {
    expect(extractOAuthProfile(GITHUB).avatarUrl).toBe("https://avatars.githubusercontent.com/u/2");
    expect(
      extractOAuthProfile({
        id: "u",
        email: "a@b.test",
        user_metadata: { picture: "https://cdn.example.test/a.png" },
      }).avatarUrl,
    ).toBe("https://cdn.example.test/a.png");
  });

  it("treats email_confirmed_at as verification on its own", () => {
    // This fixture's metadata carries no `email_verified` key at all ;
    // the Supabase-side stamp is the only signal.
    expect(extractOAuthProfile(GITHUB_NO_REAL_NAME).emailVerified).toBe(true);
  });

  it("treats user_metadata.email_verified as verification on its own", () => {
    expect(extractOAuthProfile(METADATA_VERIFIED_ONLY).emailVerified).toBe(true);
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
      identities: [{ provider: "email" }, { provider: "github" }],
    });
    expect(profile.provider).toBe("github");
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

  it("rejects providers this build hasn't wired, and non-social ones", () => {
    // Guards the boundary the whole feature leans on : a slug that
    // isn't in OAUTH_PROVIDERS must never reach signInWithOAuth.
    // `discord` is a real Supabase provider we don't offer ; `email` is
    // a Supabase identity provider but not a social one. Both are
    // deliberately chosen as slugs no follow-up is going to add, so
    // wiring another provider doesn't have to edit this assertion.
    expect(isOAuthProvider("discord")).toBe(false);
    expect(isOAuthProvider("email")).toBe(false);
    expect(isOAuthProvider("")).toBe(false);
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
    process.env.AUTH_OAUTH_PROVIDERS = " GitHub , github ";
    expect(configuredOAuthProviders()).toEqual(["github"]);
  });

  it("drops unknown slugs instead of passing them to signInWithOAuth", () => {
    // `discord` is a perfectly real Supabase provider, but it isn't in
    // this build's OAUTH_PROVIDERS, so it must not render a button.
    process.env.AUTH_OAUTH_PROVIDERS = "github,discord,myspace";
    expect(configuredOAuthProviders()).toEqual(["github"]);
  });

  it("de-duplicates repeats", () => {
    process.env.AUTH_OAUTH_PROVIDERS = "github,github,github";
    expect(configuredOAuthProviders()).toEqual(["github"]);
  });
});
