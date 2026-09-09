# `@monark/users`

User CRUD, profile updates, deletion grace.

- **Have** : placeholder.
- **Add** :
  - `data.test.ts` (integration) ; create / find / update / soft-delete round-trips ; the `findById` filter excludes soft-deleted by default ; updating a user emits the right event.
  - `profile.test.ts` ; bio / locale / avatar updates persist correctly ; trimming + length caps + unicode normalisation happen at the data layer.
  - `deletion.test.ts` ; scheduling deletion sets `deletedAt`, an admin cancellation clears it, the 14-day cron `processExpiredDeletions` only catches expired rows.
- **Coverage target** : 80 %.
