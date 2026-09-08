# Breadcrumb

The breadcrumb auto-generates from the page URL ; pages don't register anything. For `/admin/organizations/abc123` you see `Admin / Organizations / Acme`, where "Acme" is the live display name resolved from the org id.

- **Long paths collapse.** More than three segments shows the first two crumbs, an ellipsis, and the current page.
- **Some segments don't link.** `Admin` is one : the `/admin` URL just redirects to the first tab, so it renders as muted text rather than a link. In single-tenant deploys the `Organizations` crumb behaves the same way (its page redirects to the singleton's edit page).
- **Dynamic ids resolve to names.** When a URL segment is an entity id (a user, org, role, record), the breadcrumb fetches its display name and shows that instead of the raw id ; until the lookup resolves you'll briefly see the id.
