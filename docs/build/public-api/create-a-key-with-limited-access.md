---
type: how-to
---

# Create a key with limited access

Give an integration only the permissions it needs, so a leaked key can do as little as possible.

1. Open your user menu, choose **Profile**, then open the **API keys** tab.
2. Click **New API key** and enter a **Name** that says what uses it, such as `Nightly sync`.
3. Under **Access**, choose **Limited to specific permissions**.
4. Tick only the permissions the integration calls need. The [Public API reference](../../reference/public-api.md) lists the permission each endpoint requires; a read-only sync needs `data-models.read-schema` and `data-models.record-read`.
5. Pick an **Expiration**, then click **Create key** and copy the key.

A call to an endpoint outside the key's permissions returns `403` with code `forbidden`.

## Use a service account for a shared integration

A personal key stops working when its owner leaves or loses access. For a long-lived integration that belongs to the organization, an admin creates a service account instead. Its keys act as the account, with the account's own roles.

1. In **Admin**, open **Service accounts** and click **New service account**.
2. Enter a **Name**, tick the **Roles** its keys should act with (a read-only role gives read-only keys), and click **Create**.
3. In the account's **API keys** section, click **New key** and copy the key.

You need permission to manage service accounts, and service accounts must be turned on for your organization.

Good to know:

- A key can never do more than its owner. Its rights are its own permission list intersected with the owner's current permissions.
- When the owner loses a permission, every key they own loses it at the same moment; there's nothing to reissue.
- Revoke a key from the same page with **Revoke**. It stops working immediately.

Next: [Page through results](page-through-results.md)
