# `@monark/common`

Errors, event bus, logger, tRPC plumbing.

- **Have** : nothing beyond placeholder.
- **Add** :
  - `errors.test.ts` ; every error class is throwable + the `instanceof` chain works + each has the expected status code mapping.
  - `events.test.ts` ; `emit` + `on` register / fire / unsubscribe correctly ; multiple subscribers see the same event ; failures in one subscriber don't cascade.
  - `logger.test.ts` ; redaction rules strip secrets in nested objects.
  - `trpc.test.ts` ; the `requireAuth` / `requireAdmin` helpers throw the right error class on missing context.
- **Coverage target** : 80 % (small package, easy to cover fully).
