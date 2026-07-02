"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMessages } from "next-intl";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Paths whose own page renders nothing useful (pure section headers,
 * server-redirects, or routes whose only job is to forward to a
 * sub-route). Crumbs whose `href` matches an entry here render as a
 * non-clickable label so the user doesn't waste a click on a redirect
 * or a blank shell.
 *
 * `/admin` is the canonical example : its `page.tsx` is a `redirect()`
 * to the first sidebar tab. Clicking "Admin" in the breadcrumb from
 * `/admin/users/abc` would round-trip the user through `/admin` →
 * `/admin/organizations`, which doesn't match what the click implies.
 * Treating it as a label keeps the breadcrumb honest about what's
 * navigable.
 */
const ALWAYS_NON_NAVIGABLE_HREFS: ReadonlySet<string> = new Set(["/admin"]);

/**
 * Paths that are *only* non-navigable in single-tenant deploys.
 * `/admin/organizations` lands on a list view in multi-tenant (real
 * page) but server-redirects to the singleton's edit page in
 * single-tenant — same shape as `/admin` but tenancy-conditional. We
 * keep this list separate so the runtime check only adds these when
 * `bootstrapStatus.mode !== "multi"`.
 */
const SINGLE_TENANT_NON_NAVIGABLE_HREFS: ReadonlySet<string> = new Set(["/admin/organizations"]);

/**
 * Generic AppBar breadcrumb : auto-derives every crumb from the URL
 * pathname so individual pages don't need to register breadcrumb
 * metadata. The shape is :
 *
 *   {primary nav feature} / {secondary nav section} / {last subsection}
 *
 * For deeper paths, middle segments collapse behind an ellipsis :
 *
 *   /admin/organizations/abc/edit/danger-zone
 *   → "Admin / Organizations / ... / Danger Zone"
 *
 * Static segments are looked up in the `appBar.breadcrumb` i18n
 * dictionary ; unknown segments fall back to title-cased kebab-case
 * ("danger-zone" → "Danger Zone"). Dynamic id segments (anywhere a
 * route file lives at `[id]`) are dispatched to a per-pattern crumb
 * component that fetches the entity name through tRPC ; new dynamic
 * patterns are added by extending `pickCrumbForSegment` below.
 *
 * `usePathname` makes this a pure client island ; no server prop is
 * needed because the parent page already lives inside the `(authed)`
 * group and the breadcrumb is purely view-state.
 */
export function AppBarBreadcrumb() {
  const pathname = usePathname();
  // Tenancy mode toggles which routes are pure redirects ; cached
  // forever since it doesn't flip mid-session. Defaults to single
  // during the loading window so the breadcrumb doesn't briefly
  // expose a clickable `/admin/organizations` on a single-tenant
  // deploy where it would round-trip through a redirect.
  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const isSingleTenant = status.data?.mode !== "multi";

  if (pathname === "/" || pathname === "") return null;

  const segments = pathname.split("/").filter(Boolean);
  // Build the cumulative href for each crumb so all but the last
  // become clickable Links pointing at their own subpath.
  const items = segments.map((segment, index) => {
    const before = "/" + segments.slice(0, index).join("/");
    const href = "/" + segments.slice(0, index + 1).join("/");
    return { segment, before, href, isLast: index === segments.length - 1 };
  });

  // Truncation : keep the first crumb + ellipsis + the last two when
  // the path is deeper than three segments. Three or fewer renders
  // verbatim. Picks first-plus-last-two so the immediate ancestor +
  // the current page (the part the user is most likely to click) stay
  // visible ; the top-of-app context survives as the first crumb.
  const visible: Array<
    | { kind: "crumb"; segment: string; before: string; href: string; isLast: boolean }
    | { kind: "ellipsis" }
  > =
    items.length <= 3
      ? items.map((item) => ({ kind: "crumb" as const, ...item }))
      : [
          { kind: "crumb" as const, ...items[0]! },
          { kind: "ellipsis" as const },
          { kind: "crumb" as const, ...items[items.length - 2]! },
          { kind: "crumb" as const, ...items[items.length - 1]! },
        ];

  // Mobile variant : the breadcrumb chain is too noisy on a narrow
  // viewport (eats the AppBar row's right-side affordances), so show
  // only the current segment as a label. Same dispatch logic as the
  // desktop variant, just rendered alone. The `<` prefix is dropped
  // since there's no "previous" sibling to point back to ; the
  // primary-nav drawer is the canonical way back up on mobile.
  const lastItem = items[items.length - 1];

  return (
    <>
      {lastItem && (
        <span
          aria-label="Current section"
          className="flex min-w-0 items-center text-sm font-medium text-foreground sm:hidden"
        >
          <span className="truncate">
            {pickCrumbForSegment({
              before: lastItem.before,
              segment: lastItem.segment,
            })}
          </span>
        </span>
      )}
      <nav
        aria-label="Breadcrumb"
        className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground sm:flex"
      >
        {visible.map((entry, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <span aria-hidden className="select-none text-muted-foreground/50">
                /
              </span>
            )}
            {entry.kind === "ellipsis" ? (
              <span aria-hidden className="select-none">
                …
              </span>
            ) : (
              <CrumbItem
                segment={entry.segment}
                before={entry.before}
                href={entry.href}
                isLast={entry.isLast}
                isSingleTenant={isSingleTenant}
              />
            )}
          </Fragment>
        ))}
      </nav>
    </>
  );
}

function CrumbItem({
  segment,
  before,
  href,
  isLast,
  isSingleTenant,
}: {
  segment: string;
  before: string;
  href: string;
  isLast: boolean;
  isSingleTenant: boolean;
}) {
  const content = pickCrumbForSegment({ before, segment });
  // Last crumb is the current page : non-interactive span styled as
  // foreground text. Ancestors are Links that navigate up the tree —
  // unless the path is non-navigable (a pure section header /
  // redirect-only route, including the tenancy-conditional set), in
  // which case the crumb renders as a muted span so the user doesn't
  // waste a click on a redirect.
  if (isLast) {
    return (
      <span aria-current="page" className="truncate font-medium text-foreground">
        {content}
      </span>
    );
  }
  const nonNavigable =
    ALWAYS_NON_NAVIGABLE_HREFS.has(href) ||
    (isSingleTenant && SINGLE_TENANT_NON_NAVIGABLE_HREFS.has(href));
  if (nonNavigable) {
    return <span className="truncate">{content}</span>;
  }
  return (
    <Link
      href={href}
      className={cn(
        "truncate rounded-sm hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {content}
    </Link>
  );
}

// Per-pattern dispatch : the parent path determines whether a segment
// is treated as a static label or as a dynamic entity id. New `[id]`
// routes register here ; everything else flows through `StaticCrumb`.
function pickCrumbForSegment({ before, segment }: { before: string; segment: string }): ReactNode {
  if (before === "/admin/users") return <UserNameCrumb id={segment} />;
  if (before === "/admin/organizations") return <OrgNameCrumb id={segment} />;
  // `/admin/rbac/roles/<id>` carries a cuid as its terminal segment,
  // but `/admin/rbac/roles/new` is the create-role page. Skip the
  // tRPC lookup for the literal "new" path so the breadcrumb just
  // titleCase's it through `StaticCrumb`.
  if (before === "/admin/rbac/roles" && segment !== "new") {
    return <RoleNameCrumb id={segment} />;
  }
  // Same shape : `/admin/webhooks/<id>` is the editor, `/admin/webhooks/new`
  // is the create page. Resolve the endpoint's `name` so the breadcrumb
  // renders an operator-readable label instead of a cuid.
  if (before === "/admin/webhooks" && segment !== "new") {
    return <WebhookNameCrumb id={segment} />;
  }
  return <StaticCrumb segment={segment} />;
}

function StaticCrumb({ segment }: { segment: string }) {
  // Read the raw `appBar.breadcrumb` dictionary so we can look up
  // segment labels by an arbitrary key without next-intl emitting
  // missing-key warnings for the long tail of unmapped segments. The
  // fallback (kebab → Title Case) keeps unmapped routes legible
  // without operators having to register every page they ship.
  const messages = useMessages() as Record<string, unknown>;
  const breadcrumb = (messages.appBar as Record<string, unknown> | undefined)?.breadcrumb as
    | Record<string, string>
    | undefined;
  const label = breadcrumb?.[segment] ?? titleCase(segment);
  return <span className="truncate">{label}</span>;
}

function RoleNameCrumb({ id }: { id: string }) {
  // `adminGetRole` is admin-gated, but the breadcrumb only mounts on
  // `/admin/rbac/roles/<id>` paths which the admin layout already
  // gates, so the call is safe here. Falls back to the cuid while
  // loading / on error so the breadcrumb keeps rendering.
  const query = trpc.rbac.adminGetRole.useQuery(
    { id },
    { refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
  );
  const label = query.data?.name || id;
  return <span className="truncate">{label}</span>;
}

function UserNameCrumb({ id }: { id: string }) {
  // Bounded retries + cached forever : the user row doesn't change
  // shape mid-session and the crumb is a UX affordance, not the
  // source of truth. Falls back to the raw id while loading or on
  // error so the breadcrumb always renders something stable.
  const query = trpc.users.adminGetUser.useQuery(
    { userId: id },
    { refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
  );
  const label = query.data?.user.displayName || query.data?.user.email || id;
  return <span className="truncate">{label}</span>;
}

function OrgNameCrumb({ id }: { id: string }) {
  const query = trpc.organizations.adminGet.useQuery(
    { id },
    { refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
  );
  const label = query.data?.displayName || id;
  return <span className="truncate">{label}</span>;
}

function WebhookNameCrumb({ id }: { id: string }) {
  // Same caching / fallback shape as the role / user / org crumbs : the
  // webhook editor's parent layout already gates `/admin/*` to admins,
  // so the admin-only `webhooks.get` is reachable here. Falls back to
  // the cuid while loading / on error so the breadcrumb always renders
  // something stable.
  const query = trpc.webhooks.get.useQuery(
    { id },
    { refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
  );
  const label = query.data?.name || id;
  return <span className="truncate">{label}</span>;
}

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}
