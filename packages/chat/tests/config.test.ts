import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Assistant-name resolution: per-org override → CHAT_ASSISTANT_NAME → the
// shipped default. Both dependencies are DB-backed, so they're mocked here and
// the real wiring is exercised by the integration suite.

const isEnabled = vi.fn<(key: string, scope?: unknown) => Promise<boolean>>();
const getOrganizationMetadataValue =
  vi.fn<(orgId: string, module: string, key: string) => Promise<unknown>>();

vi.mock("@monark/feature-flags/server", () => ({
  isEnabled: (key: string, scope?: unknown) => isEnabled(key, scope),
}));
vi.mock("@monark/organizations/server", () => ({
  getOrganizationMetadataValue: (orgId: string, module: string, key: string) =>
    getOrganizationMetadataValue(orgId, module, key),
}));

const {
  ASSISTANT_NAME_KEY,
  CHAT_METADATA_MODULE,
  CHAT_ORG_BRANDING_FLAG,
  getAssistantName,
  getDefaultAssistantName,
  getOrganizationAssistantName,
} = await import("../src/server/config");

const ORG = "org_1";

beforeEach(() => {
  isEnabled.mockReset();
  getOrganizationMetadataValue.mockReset();
  isEnabled.mockResolvedValue(true);
  getOrganizationMetadataValue.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CHAT_ASSISTANT_NAME;
});

describe("getDefaultAssistantName", () => {
  it("falls back to the shipped default", () => {
    expect(getDefaultAssistantName()).toBe("Chrysa");
  });

  it("prefers CHAT_ASSISTANT_NAME, trimmed", () => {
    process.env.CHAT_ASSISTANT_NAME = "  Aria  ";
    expect(getDefaultAssistantName()).toBe("Aria");
  });

  it("ignores a blank CHAT_ASSISTANT_NAME", () => {
    process.env.CHAT_ASSISTANT_NAME = "   ";
    expect(getDefaultAssistantName()).toBe("Chrysa");
  });
});

describe("getOrganizationAssistantName", () => {
  it("reads the override from the chat sidecar", async () => {
    getOrganizationMetadataValue.mockResolvedValue("Nova");
    await expect(getOrganizationAssistantName(ORG)).resolves.toBe("Nova");
    expect(getOrganizationMetadataValue).toHaveBeenCalledWith(
      ORG,
      CHAT_METADATA_MODULE,
      ASSISTANT_NAME_KEY,
    );
  });

  it("returns null for a missing, blank, or non-string value", async () => {
    getOrganizationMetadataValue.mockResolvedValue(undefined);
    await expect(getOrganizationAssistantName(ORG)).resolves.toBeNull();
    getOrganizationMetadataValue.mockResolvedValue("   ");
    await expect(getOrganizationAssistantName(ORG)).resolves.toBeNull();
    getOrganizationMetadataValue.mockResolvedValue(42);
    await expect(getOrganizationAssistantName(ORG)).resolves.toBeNull();
  });
});

describe("getAssistantName", () => {
  it("uses the org override when the flag is on", async () => {
    getOrganizationMetadataValue.mockResolvedValue("Nova");
    await expect(getAssistantName({ organizationId: ORG, userId: "u1" })).resolves.toBe("Nova");
    expect(isEnabled).toHaveBeenCalledWith(CHAT_ORG_BRANDING_FLAG, {
      organizationId: ORG,
      userId: "u1",
    });
  });

  it("ignores the override when the flag is off", async () => {
    isEnabled.mockResolvedValue(false);
    getOrganizationMetadataValue.mockResolvedValue("Nova");
    await expect(getAssistantName({ organizationId: ORG })).resolves.toBe("Chrysa");
    expect(getOrganizationMetadataValue).not.toHaveBeenCalled();
  });

  it("falls back to the env name when the org has no override", async () => {
    process.env.CHAT_ASSISTANT_NAME = "Aria";
    await expect(getAssistantName({ organizationId: ORG })).resolves.toBe("Aria");
  });

  it("skips both lookups when there is no org in scope", async () => {
    await expect(getAssistantName()).resolves.toBe("Chrysa");
    await expect(getAssistantName({ organizationId: null })).resolves.toBe("Chrysa");
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it("degrades to the deploy default when the flag lookup throws", async () => {
    isEnabled.mockRejectedValue(new Error("flag service down"));
    getOrganizationMetadataValue.mockResolvedValue("Nova");
    await expect(getAssistantName({ organizationId: ORG })).resolves.toBe("Chrysa");
  });

  it("degrades to the deploy default when the sidecar read throws", async () => {
    getOrganizationMetadataValue.mockRejectedValue(new Error("db down"));
    await expect(getAssistantName({ organizationId: ORG })).resolves.toBe("Chrysa");
  });
});
