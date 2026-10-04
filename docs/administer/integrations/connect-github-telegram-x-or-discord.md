---
type: how-to
---

# Connect GitHub, Telegram, X or Discord

Link an outside service so your automations can be triggered by it or act through it. The flows themselves are built in [Automations](../../use/automations/_index.md). If Admin has no **Automation** tab, automations aren't enabled for your organization.

1. In **Admin**, open **Automation** and pick the service's tab.
2. Follow the steps for that service below. Each tab repeats them under its **Set up in** heading.

A tab that says the integration is disabled hasn't been switched on for your deployment; ask your operator.

## GitHub

1. Click **Generate webhook secret** and copy it. It's shown only once.
2. In your GitHub repository, add a webhook: the **Webhook URL** from this tab as the payload URL, content type `application/json`, and the secret you copied. Choose the events to send.
3. To let automations act on GitHub, [store a GitHub token as a secret](store-a-secret.md) and select it in your GitHub nodes.

## Telegram

1. In Telegram, ask @BotFather for a new bot and copy its token.
2. Paste it into **Bot token** and click **Connect**. Monark registers itself with Telegram. Your Monark address must be public HTTPS for this to work.

## X (Twitter)

X can only be acted on; nothing on X triggers a flow.

1. In the X developer portal, create an app with OAuth 1.0a read and write permissions, and generate an access token for your account.
2. Paste the four values (**API key (consumer key)**, **API secret (consumer secret)**, **Access token**, **Access token secret**) and click **Connect**.

## Discord

Discord needs nothing on this tab. [Store](store-a-secret.md) a bot token or a channel webhook URL as a secret, then select it in a Discord node.

To unlink GitHub, Telegram or X, click **Disconnect** on its tab.

Next: [Send events to a webhook](webhooks.md)
