# `@monark/db`

Prisma client wrapper. Generated code is excluded from coverage by default.

- **Have** : nothing.
- **Add** :
  - `client.test.ts` ; `getDb` returns a singleton ; the generated `Prisma` types + the `Notification` / `Role` / `Organization` enums survive a round-trip.
- **Coverage target** : 50 % (most code is generated). Special-case threshold exemption.
