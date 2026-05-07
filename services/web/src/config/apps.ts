import {
  Boxes,
  type LucideIcon,
} from "lucide-react"

/**
 * Single entry in the application's *app launcher* (the 3x3 grid icon
 * to the left of the notification bell). Each entry represents a
 * Monark product surface ; most entries are external apps hosted on
 * different subdomains, with one entry marked as the *current* app.
 *
 * The launcher is a discoverability surface only ; it doesn't carry
 * auth state or anything user-specific. Operators add entries by
 * editing `APPS` below as new products come online.
 */
export type AppEntry = {
  /**
   * Stable identifier. Used as the React key + the i18n message key
   * resolved as `appBar.apps.items.<id>.name` and
   * `appBar.apps.items.<id>.tagline`.
   */
  id: string
  /**
   * URL the entry navigates to. Absolute (`https://...`) for external
   * apps on other subdomains ; relative (`/`) for the current app.
   */
  href: string
  /**
   * Whether the entry opens in a new tab. External apps default to
   * `true` so the user keeps their session in the launcher's host app ;
   * the current app's entry uses `false` (and is rarely clicked anyway,
   * since it's marked as current).
   */
  external: boolean
  /**
   * Marks the app the user is currently inside. The launcher renders a
   * "current" affordance on this card ; clicking is a no-op redirect
   * to "/" but is still allowed for symmetry. Exactly one entry should
   * carry this flag in any given deploy.
   */
  current: boolean
  /** Lucide icon component rendered in the card's icon slot. */
  icon: LucideIcon
}

/**
 * Application-level apps registry. Edit THIS array to compose the
 * launcher's contents ; the order in the array IS the order in the
 * popover.
 *
 * The starter ships with just *Monark Core* (the surface this
 * codebase renders). White-label deployments add their own apps as
 * they come online ; entries are otherwise plain config so this is
 * the only file that needs editing.
 *
 * Why a static array instead of a dynamic registry : the apps surface
 * is small, slow-changing, and its membership is a deploy-time concern
 * (not user-state). A static array keeps the diff readable + avoids a
 * round-trip on every page load.
 */
export const APPS: AppEntry[] = [
  {
    id: "core",
    href: "/",
    external: false,
    current: true,
    icon: Boxes,
  },
]
