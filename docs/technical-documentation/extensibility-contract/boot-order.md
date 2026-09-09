# Boot order

[services/api/src/server.ts](../../../services/api/src/server.ts) is the canonical sequence :

1. Permission registrations, in alphabetical module order. (`registerWebhooksPermissions`, `registerOrganizationsPermissions`, …, `registerPostsPermissions`.)
2. Feature-flag registrations, same alphabetical order.
3. Notification-kind registrations (`registerCoreNotificationKinds()` + each extended module's helper).
4. Subscriber registrations (`registerNotificationSubscribers()` ; `registerWebhookSubscribers()` last so the outbox writer is the _last_ wildcard handler to fire).
5. `syncFlagsToDatabase()` upserts every registered flag's `FeatureFlag` row.
6. Worker starts (`startWebhookDeliveryWorker()`).
7. Express app comes up.

When adding an extended module to a deploy, drop its `register*` calls in the matching slots. The order between core and your module within each slot doesn't matter (registries are flat namespaces) but keeping things alphabetical makes the boot log readable.
