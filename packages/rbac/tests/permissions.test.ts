import { describe, expect, it } from "vitest"
import {
  listPermissions,
  rolesForPermission,
  type Permission,
} from "../src/contracts/permissions"
import { pickHighest } from "../src/contracts/role"

describe("rbac/permissions matrix", () => {
  it("listPermissions returns every declared key", () => {
    const all = listPermissions()
    expect(all).toContain("org:update-settings")
    expect(all).toContain("voting:cast")
    expect(new Set(all).size).toBe(all.length)
  })

  it("rolesForPermission scopes admin role assignment to MONARK_ADMIN", () => {
    expect(rolesForPermission("org:assign-admin-role")).toEqual(["MONARK_ADMIN"])
  })

  it("rolesForPermission opens voting:cast to all org-active roles", () => {
    expect(rolesForPermission("voting:cast")).toEqual(
      expect.arrayContaining(["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR"]),
    )
    expect(rolesForPermission("voting:cast")).not.toContain("STUDENT")
  })

  it("every permission entry resolves to at least one role", () => {
    for (const perm of listPermissions() as Permission[]) {
      expect(rolesForPermission(perm).length).toBeGreaterThan(0)
    }
  })

  it("MONARK_ADMIN appears in every staff-facing permission", () => {
    const staff = listPermissions().filter(
      (p) => !p.startsWith("onboarding:") && p !== "contributions:view-own",
    )
    for (const perm of staff) {
      expect(rolesForPermission(perm)).toContain("MONARK_ADMIN")
    }
  })
})

describe("rbac/role.pickHighest", () => {
  it("returns the highest-ranked role from a set", () => {
    expect(pickHighest(["STUDENT", "DEVELOPER", "AMBASSADOR"])).toBe("DEVELOPER")
  })

  it("returns null on empty input", () => {
    expect(pickHighest([])).toBeNull()
  })

  it("ranks ADMIN above DEVELOPER", () => {
    expect(pickHighest(["DEVELOPER", "ADMIN"])).toBe("ADMIN")
  })

  it("ranks MONARK_ADMIN above ADMIN", () => {
    expect(pickHighest(["ADMIN", "MONARK_ADMIN"])).toBe("MONARK_ADMIN")
  })
})
