---
type: landing
---

# Decisions

Architecture decision records, numbered in order of acceptance. A later record supersedes, never rewrites. For how things work today, read [Concepts](../concepts/_index.md).

- [0001. Split modules into core and extended tiers](0001-split-modules-into-core-and-extended-tiers.md): business features sit on a fixed core.
- [0002. Keep the event bus in memory](0002-keep-the-event-bus-in-memory.md): durability lives in outboxes.
- [0003. Open core registries to runtime registration](0003-open-core-registries-to-runtime-registration.md): modules register at boot.
- [0004. Run automations from a durable outbox](0004-run-automations-from-a-durable-outbox.md): runs are rows a worker claims.
- [0005. Give each module its own schema fragment](0005-give-each-module-its-own-schema-fragment.md): modules own their tables.
- [0006. Store integration credentials in one write-only secret store](0006-store-integration-credentials-in-a-write-only-secret-store.md): one encrypted store.
- [0007. Compile record queries to raw SQL](0007-compile-record-queries-to-raw-sql.md): to match the indexes.
- [0008. Pass automation data by reference](0008-pass-automation-data-by-reference.md): names, not wires.
- [0009. Declare integrations as manifest metadata](0009-declare-integrations-as-manifest-metadata.md): not a new tier.
- [0010. Run assistant tools in-process](0010-run-assistant-tools-in-process.md): the user stays the actor.
- [0011. Inject the assistant's tool executor at boot](0011-inject-the-assistant-tool-executor-at-boot.md): no import of the API.
- [0012. Walk the wiki page tree in application code](../../packages/wiki/docs/decisions/0012-walk-the-wiki-tree-in-app-code.md): not a recursive query.
- [0013. Store long-form content as BlockNote JSON](0013-store-long-form-content-as-blocknote-json.md): blocks, not HTML.
- [0014. Make record scopes additive across roles](0014-make-record-scopes-additive-across-roles.md): more roles never see less.
- [0015. Serve one organization per deployment](0015-serve-one-organization-per-deployment.md): one instance per business.
