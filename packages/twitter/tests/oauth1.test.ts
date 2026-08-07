import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAuthHeader,
  oauth1Signature,
  percentEncode,
  signatureBaseString,
} from "../src/server/oauth1";

// The parameter set from X's "Creating a signature" docs — a realistic vector.
// (We pin the algorithm's *structure* + verify the signing wiring against an
// independent node:crypto HMAC below, rather than a memorized magic signature.)
const DOC = {
  method: "POST",
  baseUrl: "https://api.twitter.com/1.1/statuses/update.json",
  params: {
    status: "Hello Ladies + Gentlemen, a signed OAuth request!",
    include_entities: "true",
    oauth_consumer_key: "xvz1evFS4wEEPTGEFPHBog",
    oauth_nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: "1318622958",
    oauth_token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    oauth_version: "1.0",
  },
  consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Y7v",
  tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

// The exact OAuth 1.0a signature base string for DOC: METHOD & encode(url) &
// encode(sorted, percent-encoded params). Pinning the whole string validates
// percent-encoding, key-sorting, and the double-encoding of param values.
const EXPECTED_BASE =
  "POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&" +
  "include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26" +
  "oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26" +
  "oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26" +
  "oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26" +
  "oauth_version%3D1.0%26" +
  "status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521";

describe("percentEncode", () => {
  it("encodes per RFC 3986 (space, +, ! and , all escaped)", () => {
    expect(percentEncode("Hello Ladies + Gentlemen, a signed OAuth request!")).toBe(
      "Hello%20Ladies%20%2B%20Gentlemen%2C%20a%20signed%20OAuth%20request%21",
    );
  });
});

describe("signatureBaseString", () => {
  it("builds the exact OAuth 1.0a base string (sorted keys, double-encoded values)", () => {
    expect(signatureBaseString(DOC.method, DOC.baseUrl, DOC.params)).toBe(EXPECTED_BASE);
  });
});

describe("oauth1Signature", () => {
  it("HMAC-SHA1/base64 signs the base string with key encode(cs)&encode(ts)", () => {
    // Independent reference computation via node:crypto (cs/ts have no chars that
    // percent-encode, so the signing key is `${cs}&${ts}`).
    const reference = createHmac("sha1", `${DOC.consumerSecret}&${DOC.tokenSecret}`)
      .update(EXPECTED_BASE)
      .digest("base64");
    expect(
      oauth1Signature(DOC.method, DOC.baseUrl, DOC.params, DOC.consumerSecret, DOC.tokenSecret),
    ).toBe(reference);
  });
});

describe("buildAuthHeader", () => {
  it("produces a well-formed OAuth header with a signature", () => {
    const header = buildAuthHeader({
      method: "POST",
      baseUrl: "https://api.twitter.com/2/tweets",
      credentials: {
        consumerKey: "ck",
        consumerSecret: "cs",
        accessToken: "at",
        accessTokenSecret: "ats",
      },
      nonce: "fixednonce",
      timestamp: "1700000000",
    });
    expect(header.startsWith("OAuth ")).toBe(true);
    expect(header).toContain('oauth_consumer_key="ck"');
    expect(header).toContain('oauth_nonce="fixednonce"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toMatch(/oauth_signature="[^"]+"/);
  });

  it("is deterministic for fixed nonce + timestamp", () => {
    const args = {
      method: "POST",
      baseUrl: "https://api.twitter.com/2/tweets",
      credentials: {
        consumerKey: "ck",
        consumerSecret: "cs",
        accessToken: "at",
        accessTokenSecret: "ats",
      },
      nonce: "n",
      timestamp: "1700000000",
    } as const;
    expect(buildAuthHeader({ ...args })).toBe(buildAuthHeader({ ...args }));
  });
});
