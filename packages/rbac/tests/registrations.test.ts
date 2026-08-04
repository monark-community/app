import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  _resetEventRegistryForTesting,
  eventFieldsFor,
  getEventTypeDescriptor,
  listEventTypes,
} from "@monark/common";
import {
  _resetPermissionRegistryForTesting,
  getPermissionDef,
  isKnownPermission,
  listPermissionDescriptors,
} from "../src/contracts/permissions";
import { registerRbacPermissions } from "../src/server/rbac-permissions";
import { registerRbacEventTypes } from "../src/server/event-types";

// The rbac module's boot-time registrations. These are pure (they only push
// into the in-memory permission / event-type registries), so a unit test can
// call the register function and assert the module's public contract — the
// exact permission keys and event types it contributes — which also guards
// against an accidental removal or a botched description.

beforeEach(() => {
  _resetPermissionRegistryForTesting();
  _resetEventRegistryForTesting();
});

afterAll(() => {
  _resetPermissionRegistryForTesting();
  _resetEventRegistryForTesting();
});

describe("registerRbacPermissions", () => {
  it("registers exactly the three rbac permissions with the rbac category", () => {
    registerRbacPermissions();

    for (const key of ["manage-roles", "assign-role", "assign-admin-role"]) {
      expect(isKnownPermission(`rbac.${key}`)).toBe(true);
      expect(getPermissionDef(`rbac.${key}`)?.category).toBe("rbac");
    }

    const rbacPerms = listPermissionDescriptors().filter((p) => p.module === "rbac");
    expect(rbacPerms).toHaveLength(3);
    expect(rbacPerms.map((p) => p.key).sort()).toEqual([
      "assign-admin-role",
      "assign-role",
      "manage-roles",
    ]);
    // Every entry carries a non-empty operator-facing description.
    expect(rbacPerms.every((p) => p.description.length > 0)).toBe(true);
  });

  it("does not register unrelated permission keys", () => {
    registerRbacPermissions();
    expect(isKnownPermission("rbac.not-a-real-permission")).toBe(false);
  });
});

describe("registerRbacEventTypes", () => {
  const RBAC_EVENTS = [
    "rbac.role-assigned",
    "rbac.role-revoked",
    "rbac.role-created",
    "rbac.role-updated",
    "rbac.role-deleted",
  ];

  it("registers all five rbac event types with descriptions", () => {
    registerRbacEventTypes();
    const registered = new Set(listEventTypes().map((e) => e.type));
    for (const type of RBAC_EVENTS) {
      expect(registered.has(type)).toBe(true);
      expect(getEventTypeDescriptor(type)?.description.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("describes the role-assigned + role-updated field shapes", () => {
    registerRbacEventTypes();
    const assignedFields = eventFieldsFor("rbac.role-assigned").map((f) => f.key);
    expect(assignedFields).toEqual(
      expect.arrayContaining(["assignmentId", "userId", "roleId", "roleKey", "grantedById"]),
    );
    // `changed` is the distinctive field on the update event.
    expect(eventFieldsFor("rbac.role-updated").map((f) => f.key)).toContain("changed");
  });
});
