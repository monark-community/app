import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makeEnvVarSecretResolver,
  setWebhookSecretResolver,
  resolveSecret,
  rememberSecret,
  _resetSecretStoreForTesting,
} from "../src/server/secret-store";

// Unit tests for the env-var secret resolver + the resolver hook in
// `resolveSecret`. Pure functions over `process.env` ; no DB, no
// network. The integration tests in `tests/integration/worker.test.ts`
// already cover the worker's signing path end-to-end ; this suite
// pins the resolver lookup rules : (a) endpoint-id validation,
// (b) JSON-map first / per-endpoint env var fallback,
// (c) malformed JSON falls back to empty without crashing,
// (d) `resolveSecret` consults the resolver only after the in-memory
// cache + activeStore miss.

const ENDPOINT_A = "clx9zendpointaaa";
const ENDPOINT_B = "clx9zendpointbbb";

const SAVED_ENV: Record<string, string | undefined> = {};
function clearEnv() {
  for (const key of Object.keys(process.env)) {
    if (key === "WEBHOOK_SECRETS_JSON" || key.startsWith("WEBHOOK_SECRET_")) {
      SAVED_ENV[key] = process.env[key];
      delete process.env[key];
    }
  }
}
function restoreEnv() {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete SAVED_ENV[key];
  }
}

beforeEach(() => {
  _resetSecretStoreForTesting();
  clearEnv();
});

afterEach(() => {
  restoreEnv();
  _resetSecretStoreForTesting();
});

describe("makeEnvVarSecretResolver — JSON map", () => {
  it("returns the secret from WEBHOOK_SECRETS_JSON when the id matches", async () => {
    process.env.WEBHOOK_SECRETS_JSON = JSON.stringify({
      [ENDPOINT_A]: "whsec_AbC123",
    });
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBe("whsec_AbC123");
  });

  it("returns null when the JSON map exists but the id is missing", async () => {
    process.env.WEBHOOK_SECRETS_JSON = JSON.stringify({
      [ENDPOINT_A]: "whsec_A",
    });
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_B)).toBeNull();
  });

  it("returns null when WEBHOOK_SECRETS_JSON isn't set", async () => {
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBeNull();
  });

  it("treats malformed JSON as empty + does not throw", async () => {
    process.env.WEBHOOK_SECRETS_JSON = "{not valid json";
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBeNull();
  });

  it("treats a JSON array (not an object) as empty", async () => {
    process.env.WEBHOOK_SECRETS_JSON = JSON.stringify(["whsec_A"]);
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBeNull();
  });

  it("ignores non-string values inside the map", async () => {
    process.env.WEBHOOK_SECRETS_JSON = JSON.stringify({
      [ENDPOINT_A]: 12345,
      [ENDPOINT_B]: "whsec_B",
    });
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBeNull();
    expect(await resolver(ENDPOINT_B)).toBe("whsec_B");
  });
});

describe("makeEnvVarSecretResolver — per-endpoint env vars", () => {
  it("falls back to WEBHOOK_SECRET_<id> when the JSON map doesn't carry the id", async () => {
    process.env.WEBHOOK_SECRETS_JSON = JSON.stringify({
      [ENDPOINT_A]: "whsec_A",
    });
    process.env[`WEBHOOK_SECRET_${ENDPOINT_B}`] = "whsec_B_from_var";
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBe("whsec_A");
    expect(await resolver(ENDPOINT_B)).toBe("whsec_B_from_var");
  });

  it("works with only WEBHOOK_SECRET_<id> set (no JSON map)", async () => {
    process.env[`WEBHOOK_SECRET_${ENDPOINT_A}`] = "whsec_only_var";
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver(ENDPOINT_A)).toBe("whsec_only_var");
  });
});

describe("makeEnvVarSecretResolver — endpoint-id validation", () => {
  it("rejects endpoint ids that aren't alphanumeric (defense against env-var injection)", async () => {
    process.env["WEBHOOK_SECRET_FOO_BAR"] = "whsec_should_not_match";
    const resolver = makeEnvVarSecretResolver();
    // `FOO_BAR` carries an underscore — outside the cuid() shape we
    // accept. Resolver returns null without ever indexing into env.
    expect(await resolver("FOO_BAR")).toBeNull();
  });

  it("rejects ids with path-traversal characters", async () => {
    process.env["WEBHOOK_SECRET_a../b"] = "whsec_should_not_match";
    const resolver = makeEnvVarSecretResolver();
    expect(await resolver("a../b")).toBeNull();
  });
});

describe("resolveSecret — registered resolver wiring", () => {
  it("uses the registered resolver when the cache + store both miss", async () => {
    setWebhookSecretResolver(async (id) => (id === ENDPOINT_A ? "whsec_via_resolver" : null));
    expect(await resolveSecret(ENDPOINT_A)).toBe("whsec_via_resolver");
    expect(await resolveSecret(ENDPOINT_B)).toBeNull();
  });

  it("prefers the in-memory cache over the resolver (just-rotated secrets are live for the current process)", async () => {
    // Resolver returns the "old" value ; the cache carries the "new"
    // value just minted by `rememberSecret`. The cache wins so the
    // operator doesn't have to update env vars + redeploy before the
    // next delivery picks up the rotated secret.
    setWebhookSecretResolver(async () => "whsec_old_from_resolver");
    await rememberSecret(ENDPOINT_A, "whsec_new_just_rotated");
    expect(await resolveSecret(ENDPOINT_A)).toBe("whsec_new_just_rotated");
  });

  it("returns null when the resolver throws (defensive — worker never crashes on a backing-store hiccup)", async () => {
    setWebhookSecretResolver(async () => {
      throw new Error("backing store down");
    });
    expect(await resolveSecret(ENDPOINT_A)).toBeNull();
  });

  it("clears the registered resolver when set to null", async () => {
    setWebhookSecretResolver(async () => "whsec_should_not_appear");
    setWebhookSecretResolver(null);
    expect(await resolveSecret(ENDPOINT_A)).toBeNull();
  });
});
