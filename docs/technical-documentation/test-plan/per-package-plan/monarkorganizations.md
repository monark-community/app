# `@monark/organizations`

Org CRUD, bootstrap, invites, slug rotation, redirects.

- **Have** : placeholder.
- **Add** :
  - `data.test.ts` (integration) ; CRUD round-trips ; soft-deleted orgs filter out by default ; `findOnlyActiveOrganization` returns null when count !== 1.
  - `bootstrap.test.ts` (integration) ; provisioning the singleton from env vars is idempotent ; running twice is a no-op ; the seeding actor is `system:bootstrap` ; `getCurrentOrg`'s single-tenant fallback resolves correctly.
  - `slug-rotation.test.ts` (integration) ; renaming a slug records an `OrgSlugRedirect` row with a 90-day TTL ; collisions on the new slug throw `ValidationError` cleanly.
  - `invites.test.ts` (integration) ; `createInvite` mints a unique token + persists only the SHA-256 hash ; `acceptInviteByToken` is atomic (membership + role + invite-row stamping) ; `consumePendingInvitesForUser` is idempotent.
- **Coverage target** : 80 %.
