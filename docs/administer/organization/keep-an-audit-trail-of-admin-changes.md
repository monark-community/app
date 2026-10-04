---
type: how-to
---

# Keep an audit trail of admin changes

Monark has no activity log screen. To keep a record of who changed roles, users, settings and credentials, send those events to your logging or security tool through a webhook.

1. In **Admin**, open **Webhooks** and click **New endpoint**.
2. Name it, for example "Audit log", and enter your logging tool's intake address as the **URL**.
3. Under **Event subscriptions**, tick the groups to record:
   - **rbac**: roles created, changed or deleted, assigned or revoked;
   - **organizations**: invitations, members joining or leaving, settings changes;
   - **users**: profile changes and deletions;
   - **secrets** and **api-keys**: secrets, API keys and service accounts created, changed or removed.
4. Click **Create endpoint** and give the signing secret to your logging tool.

Each event says what happened and when, and for admin actions, who did it.

To confirm events are arriving, see [Check webhook deliveries](../integrations/check-webhook-deliveries.md). Full setup options are in [Send events to a webhook](../integrations/webhooks.md).
