---
type: how-to
---

# Store a secret

Keep an external access token or API key in Monark so automations can use it without anyone seeing it. Secrets are stored encrypted, and once saved, a value is never shown again to anyone.

1. In **Admin**, open **Secrets** and click **New secret**.
2. Enter a **Name**, such as `GITHUB_TOKEN`: letters, digits and underscores, starting with a letter or underscore. Automations pick the secret by this name.
3. Paste the **Value**.
4. Optionally add a **Description** of what it's for.
5. Click **Create**.

The list shows each secret's name, when it was **Last used** and when it was **Updated**, never its value.

## Replace a value

Click the secret, enter a new **Value** and click **Save**. Leaving the value blank keeps the current one, so you can edit the description alone.

## Delete a secret

Click the secret, then **Delete** under **Danger zone**, and confirm. Automations that refer to it by name get nothing from then on.

For how secrets fit with webhooks, API keys and service accounts, see [Secrets](../../concepts/secrets.md).

Next: [Connect GitHub, Telegram, X or Discord](connect-github-telegram-x-or-discord.md)
