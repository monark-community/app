---
type: how-to
---

# Create a service account

A service account is an identity for a script, agent or integration that calls the Monark API. Its keys act as the account, not as a person, so they keep working when staff change. If Admin has no **Service accounts** tab, they aren't enabled for your organization.

1. In **Admin**, open **Service accounts** and click **New service account**.
2. Enter a **Name**, such as "Billing sync", and tick its **Roles**. Its keys can do whatever these roles allow.
3. Click **Create**.
4. Click the account and, under **API keys**, click **New key**.
5. Enter a **Name** for the key, choose an **Expiration** and click **Create key**.
6. Copy the key now. It's shown only once.

To use the key, see [Make your first API call](../../build/public-api/make-your-first-api-call.md). Keys that act as you rather than as an account are created under your own account; see [Create an API key](../../use/account/create-an-api-key.md).

## Change what it can do

Click the account, change its ticked roles and click **Save roles**. All its keys follow.

## Revoke a key, or stop the account

- **Revoke**, next to a key, stops that key.
- **Disable**, under **Danger zone**, stops every key immediately. You can't re-enable the account from Admin.
- **Delete**, under **Danger zone**, removes the account and all its keys for good.
