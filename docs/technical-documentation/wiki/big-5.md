# Big-5

- **RBAC** : `wiki.read` / `create` / `update` / `delete`, registered at boot ;
  every mutation gates through the matching capability. No per-page ACL in v1
  (org-wide access), a conscious scope choice.
- **Events** : `wiki.page-created` / `-updated` (with a `changed[]` of
  title / icon / content) / `-moved` (from → to parent) / `-deleted`. Registered
  event types make them webhook-subscribable for free.
- **Feature flag** : `wiki.enabled` (`defaultOn: false`) ; the route's server
  gate `notFound()`s when off, and the nav entry hides. Enabled on the dev
  instance via `tools/enable-dev-flags.ts`.
- **Notifications** : none in v1 (no user-facing signal a wiki edit needs to push).
