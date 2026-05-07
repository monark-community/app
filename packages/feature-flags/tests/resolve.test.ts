import { describe, expect, it } from "vitest"
import { mostSpecific } from "../src/server/resolve"
import type { OverrideRow } from "../src/server/data"

function row(partial: Partial<OverrideRow>): OverrideRow {
  return {
    id: partial.id ?? "row-id",
    flagKey: partial.flagKey ?? "auth.trusted-devices",
    organizationId: partial.organizationId ?? null,
    userId: partial.userId ?? null,
    roleId: partial.roleId ?? null,
    enabled: partial.enabled ?? true,
    setById: partial.setById ?? "admin-1",
    setAt: partial.setAt ?? new Date(),
    note: partial.note ?? null,
  }
}

describe("feature-flags/resolve.mostSpecific", () => {
  it("returns undefined when no overrides match", () => {
    expect(mostSpecific([], { userId: "u1" })).toBeUndefined()
  })

  it("returns the global override when only a global one exists", () => {
    const global = row({ id: "g" })
    expect(mostSpecific([global], {})).toBe(global)
  })

  it("user-scoped override beats role-, org-, and global-scoped", () => {
    const user = row({ id: "user", userId: "u1" })
    const role = row({ id: "role", roleId: "role_admin" })
    const org = row({ id: "org", organizationId: "o1" })
    const global = row({ id: "global" })
    const winner = mostSpecific([global, org, role, user], {
      userId: "u1",
      roleId: "role_admin",
      organizationId: "o1",
    })
    expect(winner?.id).toBe("user")
  })

  it("role-scoped override beats org- and global- when user override is absent", () => {
    const role = row({ id: "role", roleId: "role_admin" })
    const org = row({ id: "org", organizationId: "o1" })
    const global = row({ id: "global" })
    const winner = mostSpecific([global, org, role], {
      userId: "u-no-override",
      roleId: "role_admin",
      organizationId: "o1",
    })
    expect(winner?.id).toBe("role")
  })

  it("org-scoped override beats global when user + role are absent", () => {
    const org = row({ id: "org", organizationId: "o1" })
    const global = row({ id: "global" })
    const winner = mostSpecific([global, org], { organizationId: "o1" })
    expect(winner?.id).toBe("org")
  })

  it("falls back to global when no scoped override matches", () => {
    const orgOther = row({ id: "org-other", organizationId: "o2" })
    const global = row({ id: "global" })
    const winner = mostSpecific([global, orgOther], { organizationId: "o1" })
    expect(winner?.id).toBe("global")
  })

  it("ignores user-scoped rows that target a different user", () => {
    const userOther = row({ id: "user-other", userId: "u2" })
    const global = row({ id: "global" })
    const winner = mostSpecific([userOther, global], { userId: "u1" })
    expect(winner?.id).toBe("global")
  })

  it("does not match a role override when the scope has no role set", () => {
    const role = row({ id: "role", roleId: "role_admin" })
    const winner = mostSpecific([role], { userId: "u1" })
    expect(winner).toBeUndefined()
  })

  it("returns the first user-match when several rows share the same user (latest-wins is caller's job via orderBy)", () => {
    const userA = row({ id: "user-a", userId: "u1", enabled: true })
    const userB = row({ id: "user-b", userId: "u1", enabled: false })
    const winner = mostSpecific([userA, userB], { userId: "u1" })
    expect(winner?.id).toBe("user-a")
  })
})
