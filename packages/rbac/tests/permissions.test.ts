import { describe, expect, it } from "vitest"
import {
  getPermissionDef,
  isKnownPermission,
  listPermissions,
  permissionsByCategory,
  type Permission,
} from "../src/contracts/permissions"

describe("rbac/permissions registry", () => {
  it("listPermissions returns every declared key without duplicates", () => {
    const all = listPermissions()
    expect(all).toContain("org:update-settings")
    expect(all).toContain("rbac:manage-roles")
    expect(new Set(all).size).toBe(all.length)
  })

  it("isKnownPermission discriminates known vs unknown keys", () => {
    expect(isKnownPermission("org:update-settings")).toBe(true)
    expect(isKnownPermission("not:a-real-permission")).toBe(false)
  })

  it("every permission carries a description and a category", () => {
    for (const perm of listPermissions() as Permission[]) {
      const def = getPermissionDef(perm)
      expect(def.description.length).toBeGreaterThan(0)
      expect(["organization", "users", "rbac", "platform"]).toContain(
        def.category,
      )
    }
  })

  it("permissionsByCategory groups every permission exactly once", () => {
    const grouped = permissionsByCategory()
    const flattened = Object.values(grouped).flat()
    const all = listPermissions()
    expect(flattened.length).toBe(all.length)
    expect(new Set(flattened).size).toBe(all.length)
  })
})
