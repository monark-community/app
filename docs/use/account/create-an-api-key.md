---
type: how-to
---

# Create an API key

Give a script or integration a key that acts as you through the public API. You need permission to manage API keys, and the public API must be turned on for your organization; the page tells you if either is missing.

1. Click your avatar at the top right, open the **Account** tab, choose **Profile**, then open the **API keys** tab.
2. Click **New API key** and enter a **Name** that says what uses it.
3. Under **Access**, choose **Full access**, or **Limited to specific permissions** and tick only what the integration needs.
4. Pick an **Expiration**: **30 days**, **90 days**, **1 year** or **No expiration**.
5. Click **Create key**, then **Copy**. The key is shown only this once.

**Using your keys**, on the same page, shows the base URL to send it to. For a first call, follow [Make your first API call](../../build/public-api/make-your-first-api-call.md).

## Revoke a key

Click **Revoke** on the key and confirm with **Revoke key**. Anything using it loses access immediately.

Good to know:

- A key can never do more than you can. If you lose a permission, your keys lose it too.

Next: [Delete your account](delete-your-account.md)
