import { describe, expect, it, vi } from "vitest";
import { renderWithIntl, screen } from "../test-utils";

// Hooks the breadcrumb depends on. Each test sets the pathname
// explicitly ; the trpc query is stubbed to a single bootstrapStatus
// shape since the breadcrumb's tenancy-aware behaviour is what we
// want to assert against.
const mockPathname = vi.fn(() => "/account/profile");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

const mockBootstrapStatus = vi.fn(() => ({
  data: { mode: "single" as "single" | "multi" },
}));
const mockUserQuery = vi.fn(() => ({
  data: { user: { displayName: "Acme User", email: "user@example.com" } },
}));
const mockOrgQuery = vi.fn(() => ({
  data: { displayName: "Acme" },
}));
const mockRoleQuery = vi.fn(() => ({
  data: { name: "Reviewer" },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    organizations: {
      bootstrapStatus: { useQuery: () => mockBootstrapStatus() },
      adminGet: { useQuery: () => mockOrgQuery() },
    },
    users: {
      adminGetUser: { useQuery: () => mockUserQuery() },
    },
    rbac: {
      adminGetRole: { useQuery: () => mockRoleQuery() },
    },
  },
}));

import { AppBarBreadcrumb } from "@/components/app-bar-breadcrumb";

describe("<AppBarBreadcrumb>", () => {
  it("renders nothing on the home route", () => {
    mockPathname.mockReturnValue("/");
    const { container } = renderWithIntl(<AppBarBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a single segment for shallow paths", () => {
    mockPathname.mockReturnValue("/admin/users");
    renderWithIntl(<AppBarBreadcrumb />);
    // Desktop nav lives in `<nav aria-label="Breadcrumb">`.
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav.textContent).toContain("Admin");
    expect(nav.textContent).toContain("Users");
  });

  it("renders all three segments verbatim when path has exactly 3 levels", () => {
    mockPathname.mockReturnValue("/admin/users/abc-123");
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav.textContent).toContain("Admin");
    expect(nav.textContent).toContain("Users");
    // Dynamic ids resolve through the per-pattern crumb component ;
    // the user-name lookup returns the stubbed display name.
    expect(nav.textContent).toContain("Acme User");
  });

  it("collapses middle segments behind an ellipsis when path has > 3 levels", () => {
    mockPathname.mockReturnValue("/admin/users/abc-123/edit/danger-zone");
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    // First crumb + ellipsis + last two crumbs visible.
    expect(nav.textContent).toContain("Admin");
    expect(nav.textContent).toContain("…");
    expect(nav.textContent).toContain("Danger Zone");
  });

  it("renders /admin as a non-clickable label (it's a redirect-only route)", () => {
    mockPathname.mockReturnValue("/admin/users");
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    // /admin is in the always-non-navigable set ; render as a span,
    // not a link. The Users crumb after it is a real link.
    const links = nav.querySelectorAll("a");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/admin");
  });

  it("renders /admin/organizations as non-clickable in single-tenant mode", () => {
    mockBootstrapStatus.mockReturnValue({ data: { mode: "single" } });
    mockPathname.mockReturnValue("/admin/organizations/abc-123");
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    const links = nav.querySelectorAll("a");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/admin/organizations");
  });

  it("renders /admin/organizations as clickable in multi-tenant mode", () => {
    mockBootstrapStatus.mockReturnValue({ data: { mode: "multi" } });
    mockPathname.mockReturnValue("/admin/organizations/abc-123");
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    const links = nav.querySelectorAll("a");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/admin/organizations");
  });

  it("resolves dynamic user ids to display names", () => {
    mockPathname.mockReturnValue("/admin/users/u-1");
    mockUserQuery.mockReturnValue({
      data: {
        user: { displayName: "Dominic Fournier", email: "dom@monark.io" },
      },
    });
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav.textContent).toContain("Dominic Fournier");
  });

  it("resolves dynamic org ids to display names", () => {
    mockBootstrapStatus.mockReturnValue({ data: { mode: "multi" } });
    mockPathname.mockReturnValue("/admin/organizations/o-1");
    mockOrgQuery.mockReturnValue({
      data: { displayName: "Beta Co" },
    });
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav.textContent).toContain("Beta Co");
  });

  it("resolves dynamic role ids to display names", () => {
    mockPathname.mockReturnValue("/admin/rbac/roles/r-1");
    mockRoleQuery.mockReturnValue({ data: { name: "Editor" } });
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav.textContent).toContain("Editor");
  });

  it("does not call adminGetRole for the literal `new` segment", () => {
    mockPathname.mockReturnValue("/admin/rbac/roles/new");
    mockRoleQuery.mockClear();
    renderWithIntl(<AppBarBreadcrumb />);
    // The `new` literal flows through StaticCrumb (i18n lookup), not
    // RoleNameCrumb (which would hit the trpc query). Verifies the
    // dispatch logic in pickCrumbForSegment.
    expect(mockRoleQuery).not.toHaveBeenCalled();
  });

  it("falls back to title-cased kebab-case for unmapped static segments", () => {
    mockPathname.mockReturnValue("/some/random-segment/here");
    renderWithIntl(<AppBarBreadcrumb />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    // "random-segment" → "Random Segment"
    expect(nav.textContent).toContain("Random Segment");
    // "here" → "Here"
    expect(nav.textContent).toContain("Here");
  });
});
