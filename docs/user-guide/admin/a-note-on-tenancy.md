# A note on tenancy

The admin UX adapts to the deploy's tenancy mode :

- **Single-tenant** (default) : exactly one organization exists. The Organizations tab redirects directly to that organization's edit page ; no list view. The role manager auto-selects the singleton org. User-side flows that would ask you to pick an org collapse to nothing.
- **Multi-tenant** (operator opt-in via the `tenancy.multi-tenant` feature flag) : multiple organizations live side by side. Admin surfaces grow org pickers ; the Organizations tab renders a paginated list.

This guide notes per-mode differences inline.
