import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the data layer
vi.mock("../src/server/data", () => ({
  findMatchingEndpoints: vi.fn().mockResolvedValue([]),
  enqueueDeliveries: vi.fn().mockResolvedValue(undefined),
  findUserMemberOrgIds: vi.fn().mockResolvedValue([]),
  findOnlySingletonOrgId: vi.fn().mockResolvedValue(null),
}))

// Mock secrets (computeIdempotencyKey)
vi.mock("../src/server/secrets", () => ({
  computeIdempotencyKey: vi.fn().mockReturnValue("mock-idem-key-000000000000000000000000000000000000000000000000"),
}))

// Mock @monark/common
const mockOn = vi.fn()
vi.mock("@monark/common", () => ({
  WILDCARD_EVENT_TYPE: "*",
  on: (...args: unknown[]) => mockOn(...args),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import {
  findMatchingEndpoints,
  enqueueDeliveries,
  findUserMemberOrgIds,
  findOnlySingletonOrgId,
} from "../src/server/data"
import { computeIdempotencyKey } from "../src/server/secrets"
import {
  registerWebhookSubscribers,
  _resetWebhookSubscribersForTesting,
} from "../src/server/subscribers"

type EventHandler = (event: Record<string, unknown>) => Promise<void>
let handler: EventHandler

beforeEach(() => {
  vi.clearAllMocks()
  _resetWebhookSubscribersForTesting()
  mockOn.mockImplementation((_type: string, fn: EventHandler) => {
    handler = fn
  })
  registerWebhookSubscribers()
})

afterEach(() => {
  _resetWebhookSubscribersForTesting()
})

function makeEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "ep-1",
    organizationId: "org-1",
    name: "Test",
    url: "https://example.com/hook",
    status: "active",
    ...overrides,
  }
}

describe("registerWebhookSubscribers", () => {
  it("registers a wildcard event handler", () => {
    expect(mockOn).toHaveBeenCalledWith("*", expect.any(Function))
  })

  it("is idempotent — second call does not double-register", () => {
    const callCount = mockOn.mock.calls.length
    registerWebhookSubscribers()
    expect(mockOn.mock.calls.length).toBe(callCount)
  })
})

describe("event routing", () => {
  it("skips webhook.* events to prevent recursion", async () => {
    await handler({ type: "webhook.delivery-succeeded", endpointId: "ep-1" })

    expect(findMatchingEndpoints).not.toHaveBeenCalled()
    expect(enqueueDeliveries).not.toHaveBeenCalled()
  })

  it("does nothing when no endpoints match", async () => {
    vi.mocked(findMatchingEndpoints).mockResolvedValue([])

    await handler({ type: "rbac.role-created", organizationId: "org-1" })

    expect(enqueueDeliveries).not.toHaveBeenCalled()
  })

  it("platform-tier endpoint (orgId=null) receives every matching event", async () => {
    const endpoint = makeEndpoint({ id: "ep-platform", organizationId: null })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])

    await handler({ type: "rbac.role-created", organizationId: "org-1" })

    expect(enqueueDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: expect.arrayContaining([
          expect.objectContaining({ endpointId: "ep-platform" }),
        ]),
        eventType: "rbac.role-created",
      }),
    )
  })

  it("org-scoped endpoint receives event with matching organizationId", async () => {
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-1" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])

    await handler({ type: "rbac.role-created", organizationId: "org-1" })

    expect(enqueueDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: expect.arrayContaining([
          expect.objectContaining({ endpointId: "ep-org" }),
        ]),
      }),
    )
  })

  it("org-scoped endpoint skips event with different organizationId", async () => {
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-1" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])

    await handler({ type: "rbac.role-created", organizationId: "org-other" })

    expect(enqueueDeliveries).not.toHaveBeenCalled()
  })

  it("user-tied event fans out to endpoints matching user member orgs", async () => {
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-1" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])
    vi.mocked(findUserMemberOrgIds).mockResolvedValue(["org-1", "org-2"])

    await handler({ type: "user.signed-in", userId: "user-1" })

    expect(findUserMemberOrgIds).toHaveBeenCalledWith("user-1")
    expect(enqueueDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: expect.arrayContaining([
          expect.objectContaining({ endpointId: "ep-org" }),
        ]),
      }),
    )
  })

  it("user-tied event skips endpoints for orgs the user is not a member of", async () => {
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-3" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])
    vi.mocked(findUserMemberOrgIds).mockResolvedValue(["org-1", "org-2"])

    await handler({ type: "user.signed-in", userId: "user-1" })

    expect(enqueueDeliveries).not.toHaveBeenCalled()
  })

  it("single-tenant fallback fires when no memberships and exactly 1 org", async () => {
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-singleton" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])
    vi.mocked(findUserMemberOrgIds).mockResolvedValue([])
    vi.mocked(findOnlySingletonOrgId).mockResolvedValue("org-singleton")

    await handler({ type: "user.signed-in", userId: "user-1" })

    expect(findOnlySingletonOrgId).toHaveBeenCalled()
    expect(enqueueDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: expect.arrayContaining([
          expect.objectContaining({ endpointId: "ep-org" }),
        ]),
      }),
    )
  })

  it("single-tenant fallback does NOT fire when 2+ orgs exist", async () => {
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-1" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])
    vi.mocked(findUserMemberOrgIds).mockResolvedValue([])
    vi.mocked(findOnlySingletonOrgId).mockResolvedValue(null)

    await handler({ type: "user.signed-in", userId: "user-1" })

    expect(enqueueDeliveries).not.toHaveBeenCalled()
  })

  it("membership lookup only runs when needed", async () => {
    // Event with orgId set — should NOT trigger membership lookup
    const endpoint = makeEndpoint({ id: "ep-org", organizationId: "org-1" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])

    await handler({ type: "rbac.role-created", organizationId: "org-1" })

    expect(findUserMemberOrgIds).not.toHaveBeenCalled()
    expect(findOnlySingletonOrgId).not.toHaveBeenCalled()
  })

  it("membership lookup only runs when org-scoped endpoints exist", async () => {
    // Only platform-tier endpoints + user-tied event
    const endpoint = makeEndpoint({ id: "ep-platform", organizationId: null })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([endpoint])

    await handler({ type: "user.signed-in", userId: "user-1" })

    expect(findUserMemberOrgIds).not.toHaveBeenCalled()
  })

  it("mixed platform + org endpoints: both receive when rules match", async () => {
    const platform = makeEndpoint({ id: "ep-platform", organizationId: null })
    const orgMatch = makeEndpoint({ id: "ep-org", organizationId: "org-1" })
    vi.mocked(findMatchingEndpoints).mockResolvedValue([platform, orgMatch])

    await handler({ type: "rbac.role-created", organizationId: "org-1" })

    expect(enqueueDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: expect.arrayContaining([
          expect.objectContaining({ endpointId: "ep-platform" }),
          expect.objectContaining({ endpointId: "ep-org" }),
        ]),
      }),
    )
  })
})

describe("error handling", () => {
  it("catches subscriber errors without throwing", async () => {
    vi.mocked(findMatchingEndpoints).mockRejectedValue(new Error("DB down"))

    // Should not throw
    await expect(
      handler({ type: "rbac.role-created", organizationId: "org-1" }),
    ).resolves.toBeUndefined()
  })
})
