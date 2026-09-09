# Test surface

Each of the five extension points has its own runtime-reset helper for tests :

- `_resetFlagRegistryForTesting()` from `@monark/feature-flags/contracts`
- `_resetPermissionRegistryForTesting()` from `@monark/rbac/contracts`
- `_resetNotificationRegistryForTesting()` from `@monark/notifications/contracts`
- `_resetHandlersForTesting()` from `@monark/common`
- `_resetWebhookSubscribersForTesting()` from `@monark/webhooks/server`

A test that exercises one extension point in isolation calls the matching reset in `beforeEach` + re-registers the slice it needs, so tests don't leak state across files. The integration suites that boot the full registry (e.g. the email-shell snapshot test) call `registerCore*()` once at module-eval and rely on idempotency.
