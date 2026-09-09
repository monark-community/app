# What admins _can't_ do today

- **Change a user's email directly.** The flow is in the [backlog](../../todo/backlog.md) ; needs a design call between "direct mutation" (fast but skips user confirmation) and "pending-token with user confirmation" (safer but new infra). Until then, ask the user to change it themselves from `/account/security`.
- **Bulk operations** (bulk assign role, bulk delete, bulk invite). Single-row only.
- **Cross-org role copying.** Each org's roles are scoped to the org ; recreating the same role in another org is a manual exercise.
- **Audit / activity feed.** No timeline view yet ; rely on logs.
- **Webhook delivery rate limiting per endpoint.** A receiver returning 429 retries with backoff but doesn't pause sibling deliveries to the same endpoint.
- **Webhook delivery log export.** No CSV or JSON download of delivery history.
