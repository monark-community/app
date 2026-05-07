import { redirect } from "next/navigation"

/**
 * `/account` is the canonical entry point but doesn't carry its own
 * surface ; forward straight to the *Profile* tab so the user lands
 * on a real section. The account-shell sub-routes (profile / security
 * / notifications / danger) handle the actual content ; this redirect
 * keeps existing `/account` bookmarks + email links from breaking.
 *
 * The redirect runs after the parent `(authed)/layout.tsx` rbac /
 * grace-period gates. Grace-period users land on
 * `/account/profile` here, which is allowed read-only ; they can
 * still navigate to `/account/danger` from the sidebar to cancel.
 */
export default function AccountIndexPage() {
  redirect("/account/profile")
}
