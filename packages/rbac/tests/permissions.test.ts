import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetPermissionRegistryForTesting,
  getPermissionDef,
  isKnownPermission,
  listPermissions,
  parsePermissionKey,
  permissionsByCategory,
  registerPermissions,
} from "../src/contracts/permissions";

beforeEach(() => {
  _resetPermissionRegistryForTesting();
  registerPermissions("organizations", {
    "update-settings": {
      description: "Edit organization profile.",
      category: "organization",
    },
    "invite-member": {
      description: "Send invites to new members.",
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

describe("rbac/permissions runtime registry", () => {
  it("listPermissions returns every registered dotted key, sorted, without duplicates", () => {
    const all = listPermissions();
    expect(all).toContain("organizations.update-settings");
    expect(all).toContain("rbac.manage-roles");
    expect(new Set(all).size).toBe(all.length);
  });

  it("isKnownPermission discriminates known vs unknown dotted keys", () => {
    expect(isKnownPermission("organizations.update-settings")).toBe(true);
    expect(isKnownPermission("not.real-permission")).toBe(false);
    expect(isKnownPermission("malformed")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
    expect(isKnownPermission(".trailing-only")).toBe(false);
  });

  it("every permission carries a description and a category", () => {
    for (const perm of listPermissions()) {
      const def = getPermissionDef(perm);
      expect(def?.description.length).toBeGreaterThan(0);
      expect(typeof def?.category).toBe("string");
    }
  });

  it("permissionsByCategory groups every permission exactly once", () => {
    const grouped = permissionsByCategory();
    const flattened = Object.values(grouped).flat();
    const all = listPermissions();
    expect(flattened.length).toBe(all.length);
    expect(new Set(flattened).size).toBe(all.length);
  });

  it("parsePermissionKey splits on the first dot", () => {
    expect(parsePermissionKey("organizations.update-settings")).toEqual({
      module: "organizations",
      key: "update-settings",
    });
    expect(parsePermissionKey("missing-dot")).toBeNull();
  });

  it("lets a non-core module register its own permissions without colliding", () => {
    registerPermissions("posts", {
      publish: { description: "Publish a draft.", category: "posts" },
    });
    expect(isKnownPermission("posts.publish")).toBe(true);
    // Core registrations remain.
    expect(isKnownPermission("rbac.manage-roles")).toBe(true);
  });

  it("two modules can declare the same key without colliding", () => {
    registerPermissions("posts", {
      "manage-roles": {
        description: "Manage post-author roles inside a project.",
        category: "posts",
      },
    });
    expect(isKnownPermission("rbac.manage-roles")).toBe(true);
    expect(isKnownPermission("posts.manage-roles")).toBe(true);
    expect(getPermissionDef("rbac.manage-roles")?.category).toBe("rbac");
    expect(getPermissionDef("posts.manage-roles")?.category).toBe("posts");
  });
});
