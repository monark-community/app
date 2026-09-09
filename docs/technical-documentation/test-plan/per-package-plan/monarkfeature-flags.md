# `@monark/feature-flags`

Flag registry, scoped resolution.

- **Have** : `flags.test.ts`, `resolve.test.ts`, `placeholder.test.ts`.
- **Add** :
  - `data.test.ts` (integration) ; CRUD against the override table ; uniqueness constraints fire correctly ; deleting a role / org / user nulls the matching scope columns.
  - `is-enabled.test.ts` ; the runtime `isEnabled` walks scoped → role → org → global → registry default in the right order.
- **Coverage target** : 85 %.
