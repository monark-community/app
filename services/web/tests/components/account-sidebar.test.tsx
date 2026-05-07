import { describe, expect, it, vi } from "vitest"
import { renderWithIntl, screen } from "../test-utils"

// Mock the next/navigation `usePathname` hook before importing the
// component. Every test below sets the return value explicitly so the
// active-state logic can be exercised against multiple URLs.
const mockPathname = vi.fn(() => "/account/profile")
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}))

// Mock the tRPC client. The component reads `trpc.users.me.useQuery`
// to detect the deletion-grace period ; mocking returns a controllable
// shape per test. We don't pull in the real client (which would drag
// in the whole transport stack) — only the surface this component
// touches.
const mockMeData: { deletedAt: Date | null } | undefined = undefined
const mockMe = vi.fn(() => ({
  data: mockMeData as { deletedAt: Date | null } | undefined,
}))
vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      me: {
        useQuery: () => mockMe(),
      },
    },
  },
}))

import { AccountSidebar } from "@/app/(authed)/account/account-sidebar"

describe("<AccountSidebar>", () => {
  it("renders all four tabs by default", () => {
    mockPathname.mockReturnValue("/account/profile")
    mockMe.mockReturnValue({ data: { deletedAt: null } })
    renderWithIntl(<AccountSidebar />)
    // Labels come from the en messages (`account.tabs.profile`, etc.).
    expect(screen.getByRole("link", { name: /profile/i })).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /security/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /notifications/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /danger/i })).toBeInTheDocument()
  })

  it("filters down to profile + danger during the deletion-grace window", () => {
    mockPathname.mockReturnValue("/account/danger")
    mockMe.mockReturnValue({
      data: { deletedAt: new Date("2026-05-01") },
    })
    renderWithIntl(<AccountSidebar />)
    expect(screen.getByRole("link", { name: /profile/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /danger/i })).toBeInTheDocument()
    // The blocked tabs are completely hidden — not greyed out.
    expect(
      screen.queryByRole("link", { name: /security/i }),
    ).toBeNull()
    expect(
      screen.queryByRole("link", { name: /notifications/i }),
    ).toBeNull()
  })

  it("marks the active tab via aria-current=page", () => {
    mockPathname.mockReturnValue("/account/security")
    mockMe.mockReturnValue({ data: { deletedAt: null } })
    renderWithIntl(<AccountSidebar />)
    const securityLink = screen.getByRole("link", { name: /security/i })
    expect(securityLink.getAttribute("aria-current")).toBe("page")
    // Other tabs are not marked.
    const profileLink = screen.getByRole("link", { name: /profile/i })
    expect(profileLink.getAttribute("aria-current")).not.toBe("page")
  })

  it("treats sub-paths of a tab as active (URL prefix match)", () => {
    // A future tab with sub-routes ; the current shape is flat, but
    // the breadcrumb uses the same prefix-match rule everywhere.
    mockPathname.mockReturnValue("/account/security/totp")
    mockMe.mockReturnValue({ data: { deletedAt: null } })
    renderWithIntl(<AccountSidebar />)
    const securityLink = screen.getByRole("link", { name: /security/i })
    expect(securityLink.getAttribute("aria-current")).toBe("page")
  })

  it("falls back to no-active-tab when pathname doesn't match any tab", () => {
    mockPathname.mockReturnValue("/something/else")
    mockMe.mockReturnValue({ data: { deletedAt: null } })
    renderWithIntl(<AccountSidebar />)
    // No link carries aria-current=page when nothing matches. The
    // sidebar still renders all four tabs.
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(4)
    expect(
      links.every((l) => l.getAttribute("aria-current") !== "page"),
    ).toBe(true)
  })

  it("treats undefined query data as 'not in grace' (loading state)", () => {
    mockPathname.mockReturnValue("/account/profile")
    // Before the query resolves, `data` is undefined. The component
    // should default to the full tab list (the server-side gate is
    // the actual lock).
    mockMe.mockReturnValue({ data: undefined })
    renderWithIntl(<AccountSidebar />)
    expect(screen.getAllByRole("link")).toHaveLength(4)
  })

  it("renders horizontal orientation when requested (mobile fallback)", () => {
    mockPathname.mockReturnValue("/account/profile")
    mockMe.mockReturnValue({ data: { deletedAt: null } })
    renderWithIntl(<AccountSidebar orientation="horizontal" />)
    // The sidebar primitive renders a `<nav>` ; smoke-check that
    // the orientation prop made it through (the role is still
    // "navigation" regardless ; the styling differs).
    expect(screen.getByRole("navigation")).toBeInTheDocument()
  })
})
