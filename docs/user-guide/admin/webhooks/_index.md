# Webhooks

`/admin/webhooks`. Register HTTP endpoints that receive a POST for every domain event the platform emits. Use webhooks to push lifecycle events (role changes, user sign-ins, org updates) into external systems ; social-media automation, SIEM ingestion, audit-log sinks, or anything else that can accept a signed HTTP POST.

Webhooks are gated by three permissions registered at boot : `webhooks.read` (view endpoints + deliveries), `webhooks.write` (create / edit / delete / rotate), and `webhooks.retry` (manually retry a failed delivery). Org-scoped endpoints check the permission against the endpoint's organization ; platform-tier endpoints require the permission at the platform tier (sysadmins).

## In this section

- **[Endpoint list](endpoint-list.md)**
- **[Creating an endpoint](creating-an-endpoint.md)**
- **[Editing an endpoint](editing-an-endpoint.md)**
- **[Delivery history](delivery-history.md)**
- **[Delivery detail](delivery-detail.md)**
- **[Auto-disable](auto-disable.md)**
- **[Signing](signing.md)**
- **[Routing](routing.md)**
