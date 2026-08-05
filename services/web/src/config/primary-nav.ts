import { CalendarDays, Database, GitPullRequest, SquareKanban, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Single entry in the application's primary nav (the hamburger drawer
 * on the left of the AppBar). Modules opt-in by exporting a value of
 * this shape and the application config (`PRIMARY_NAV` below) imports
 * it. Modules that don't ship a primary surface — auth, branding,
 * notifications, etc. — never register here.
 */
export type PrimaryNavEntry = {
  /**
   * Stable identifier. Used as the React key + the i18n message key
   * resolved as `appBar.primaryNav.items.<id>`. Must match across
   * languages so the drawer can render in any locale.
   */
  id: string;
  /** Path the entry navigates to. Active-state matching uses `startsWith`. */
  href: string;
  /** Lucide icon component rendered to the left of the label. */
  icon: LucideIcon;
  /**
   * Optional path-prefix mapping for the AppBar section title. When
   * the user is on a route under `sectionPrefix`, the AppBar shows
   * the same `id` as the title. Falls back to `href` when omitted.
   */
  sectionPrefix?: string;
  /**
   * Optional feature-flag key (dotted, e.g. `"kanban.board"`). When set and
   * the flag resolves `false` for the session, the entry is hidden from the
   * drawer. Visibility is a UX affordance ; the route's own server-side flag
   * gate is the real boundary.
   */
  flag?: string;
};

/**
 * Application-level primary-nav order. Edit THIS array to compose the
 * drawer ; module-level imports go here. The order in the array IS the
 * order in the drawer.
 *
 * Today no module registers — the array is empty by design. The drawer
 * renders an "no module registered" empty state in that case so the
 * brand chrome still has somewhere to live without a misleading list of
 * placeholder routes.
 *
 * White-label retargeting :
 *   1. Build a module under `packages/<your-feature>/` that exports a
 *      `primaryNavEntry: PrimaryNavEntry` from its `web-nav` (or
 *      similar) sub-path.
 *   2. Add the import here + push the entry into the array. Order is
 *      array order.
 *   3. Add the matching i18n string under `appBar.primaryNav.items.<id>`
 *      in en + fr. (See `appBar.primaryNav.empty` for the format.)
 *
 * Why a single ordered array instead of a registered-then-ordered split :
 * keeps the file diff-readable ; one place to look when debugging
 * "why is X showing up / not showing up".
 */
export const PRIMARY_NAV: PrimaryNavEntry[] = [
  { id: "calendar", href: "/calendar", icon: CalendarDays },
  { id: "kanban", href: "/kanban", icon: SquareKanban, flag: "kanban.board" },
  { id: "automation", href: "/automation", icon: Workflow, flag: "automation.enabled" },
  { id: "github", href: "/github", icon: GitPullRequest, flag: "github.enabled" },
  // Custom data models (projects, industries, …) are grouped under the
  // Data section ; its own secondary nav (DataSidebar) lists the models.
  // `/data` server-redirects to the first model.
  { id: "data", href: "/data", icon: Database },
];
