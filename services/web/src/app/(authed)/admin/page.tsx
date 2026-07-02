import { redirect } from "next/navigation";
import { ADMIN_TABS } from "./admin-tabs";

// `/admin` is the canonical entry point ; we don't render a separate
// dashboard yet. Forward straight to the *first* tab in the admin
// sidebar so admins land on something actionable instead of staring
// at an empty section header. The redirect target is read from the
// shared `ADMIN_TABS` array so reordering the sidebar (today : orgs
// → users → rbac) automatically retargets `/admin` to whatever's
// pinned at index 0.
//
// In single-tenant deploys `/admin/organizations` further redirects
// to the singleton org's edit page ; in multi-tenant it lands on the
// list view. Either way the operator hits a real surface in one hop.
//
// The redirect happens *after* the layout's rbac gate, so non-admins
// are bounced to `/` before reaching here.
export default function AdminHomePage() {
  redirect(ADMIN_TABS[0]!.href);
}
