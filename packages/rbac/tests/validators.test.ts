import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@monark/common";
import {
  _resetPermissionRegistryForTesting,
  registerPermissions,
} from "../src/contracts/permissions";
import { validateColor, validatePermissionList, validateRoleKey } from "../src/server/validators";

beforeEach(() => {
  _resetPermissionRegistryForTesting();
  registerPermissions("organizations", {
    "update-settings": {
      description: "Edit organization profile.",
      category: "organization",
    },
    "invite-member": {
      description: "Send invites.",
      category: "users",
    },
  });
  registerPermissions("rbac", {
    "manage-roles": {
      description: "Create / edit / delete custom roles.",
      category: "rbac",
    },
  });
});

afterEach(() => {
  _resetPermissionRegistryForTesting();
});

describe("rbac/validators.validateColor", () => {
  it("returns null for null / undefined / empty / whitespace inputs", () => {
    expect(validateColor(null)).toBeNull();
    expect(validateColor(undefined)).toBeNull();
    expect(validateColor("")).toBeNull();
    expect(validateColor("   ")).toBeNull();
  });

  it("accepts 6-digit hex codes (lower- + upper-case)", () => {
    expect(validateColor("#F0870C")).toBe("#F0870C");
    expect(validateColor("#abcdef")).toBe("#abcdef");
    expect(validateColor("#000000")).toBe("#000000");
  });

  it("accepts 3-digit hex shorthand", () => {
    expect(validateColor("#fff")).toBe("#fff");
    expect(validateColor("#000")).toBe("#000");
    expect(validateColor("#aBc")).toBe("#aBc");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateColor("  #F0870C  ")).toBe("#F0870C");
  });

  it("rejects hex codes without the leading #", () => {
    expect(() => validateColor("F0870C")).toThrow(ValidationError);
  });

  it("rejects hex codes with the wrong digit count", () => {
    expect(() => validateColor("#F087")).toThrow(ValidationError);
    expect(() => validateColor("#F0870")).toThrow(ValidationError);
    expect(() => validateColor("#F0870CD")).toThrow(ValidationError);
  });

  it("rejects non-hex characters", () => {
    expect(() => validateColor("#GGGGGG")).toThrow(ValidationError);
    expect(() => validateColor("#zzz")).toThrow(ValidationError);
  });

  it("rejects bare colour names", () => {
    expect(() => validateColor("orange")).toThrow(ValidationError);
    expect(() => validateColor("rgb(255,0,0)")).toThrow(ValidationError);
  });
});

describe("rbac/validators.validateRoleKey", () => {
  it("returns the trimmed + lowercased key for valid input", () => {
    expect(validateRoleKey("moderator")).toBe("moderator");
    expect(validateRoleKey("  Moderator  ")).toBe("moderator");
    expect(validateRoleKey("editor_2")).toBe("editor_2");
    expect(validateRoleKey("custom-role")).toBe("custom-role");
  });

  it("accepts digits anywhere in the key after the first char", () => {
    expect(validateRoleKey("r2")).toBe("r2");
    expect(validateRoleKey("0role")).toBe("0role");
  });

  it("rejects keys shorter than 2 chars", () => {
    expect(() => validateRoleKey("a")).toThrow(ValidationError);
    expect(() => validateRoleKey("")).toThrow(ValidationError);
  });

  it("rejects keys longer than 60 chars", () => {
    const long = "a".repeat(61);
    expect(() => validateRoleKey(long)).toThrow(ValidationError);
  });

  it("rejects keys with invalid characters (space, slash, dot)", () => {
    expect(() => validateRoleKey("my role")).toThrow(ValidationError);
    expect(() => validateRoleKey("role/admin")).toThrow(ValidationError);
    expect(() => validateRoleKey("role.admin")).toThrow(ValidationError);
    expect(() => validateRoleKey("role!")).toThrow(ValidationError);
  });

  it("rejects keys that start or end with a separator", () => {
    expect(() => validateRoleKey("-role")).toThrow(ValidationError);
    expect(() => validateRoleKey("_role")).toThrow(ValidationError);
    expect(() => validateRoleKey("role-")).toThrow(ValidationError);
    expect(() => validateRoleKey("role_")).toThrow(ValidationError);
  });

  it("reserves the built-in ADMIN key (case-insensitive)", () => {
    expect(() => validateRoleKey("ADMIN")).toThrow(ValidationError);
    expect(() => validateRoleKey("admin")).toThrow(ValidationError);
    expect(() => validateRoleKey("Admin")).toThrow(ValidationError);
  });

  it("reserves the built-in SYSADMIN key (case-insensitive)", () => {
    expect(() => validateRoleKey("SYSADMIN")).toThrow(ValidationError);
    expect(() => validateRoleKey("sysadmin")).toThrow(ValidationError);
  });

  it("emits the reserved-key error message that names the key", () => {
    try {
      validateRoleKey("admin");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("admin");
      expect((err as ValidationError).message).toContain("reserved");
    }
  });
});

describe("rbac/validators.validatePermissionList", () => {
  it("returns the deduplicated, in-order list of known permissions as parsed pairs", () => {
    const out = validatePermissionList([
      "organizations.update-settings",
      "organizations.invite-member",
      "organizations.update-settings", // duplicate ; first occurrence wins
    ]);
    expect(out).toEqual([
      { module: "organizations", key: "update-settings" },
      { module: "organizations", key: "invite-member" },
    ]);
  });

  it("returns an empty list for an empty input", () => {
    expect(validatePermissionList([])).toEqual([]);
  });

  it("preserves the input order (not alphabetical)", () => {
    const out = validatePermissionList([
      "rbac.manage-roles",
      "organizations.update-settings",
      "organizations.invite-member",
    ]);
    expect(out).toEqual([
      { module: "rbac", key: "manage-roles" },
      { module: "organizations", key: "update-settings" },
      { module: "organizations", key: "invite-member" },
    ]);
  });

  it("throws ValidationError on an unknown permission key", () => {
    expect(() =>
      validatePermissionList(["organizations.update-settings", "totally.made-up"]),
    ).toThrow(ValidationError);
  });

  it("error message names the offending key so the UI can highlight it", () => {
    try {
      validatePermissionList(["totally.made-up"]);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("totally.made-up");
    }
  });

  it("rejects on the first unknown key (doesn't continue past it)", () => {
    expect(() => validatePermissionList(["first.unknown", "second.also-unknown"])).toThrow(
      /first\.unknown/,
    );
  });
});
