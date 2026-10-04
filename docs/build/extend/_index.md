---
type: landing
---

# Extend Monark

Add features to the platform itself: new modules, and hooks into permissions, events, notifications, search, automations, the API and the assistant. You need a [development environment](../../get-started/set-up-a-development-environment.md); [Architecture](../../concepts/architecture/_index.md) explains the module system these pages build on.

- [Add a module](add-a-module.md): scaffold a package and wire it into the platform.
- [Register permissions](register-permissions.md): make each write grantable per role.
- [Emit a domain event](emit-a-domain-event.md): announce changes to other modules, automations and webhooks.
- [Send a notification](send-a-notification.md): tell a person, in the app or by email.
- [Put a feature behind a flag](put-a-feature-behind-a-flag.md): ship dark and turn it on per organization or user.
- [Change the database schema](change-the-database-schema.md): add a table and ship its migration.
- [Write tests](write-tests.md): add unit and integration tests and keep coverage up.
- [Add a search source](add-a-search-source.md): put your module's items in the global search palette.
- [Add an automation node type](add-an-automation-node.md): give flow builders a new action.
- [Add a public API endpoint](add-a-public-api-endpoint.md): expose a procedure over REST and to agents.
- [Give the assistant a new tool](add-an-assistant-tool.md): let the in-app assistant do something new.
