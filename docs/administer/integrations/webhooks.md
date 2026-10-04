---
type: how-to
---

# Send events to a webhook

A webhook endpoint gets an HTTP POST from Monark each time an event it subscribes to happens, such as a role being assigned or a record created. Use one to feed another system. Whoever builds the receiving end should read [Webhooks for developers](../../build/webhooks/_index.md).

1. In **Admin**, open **Webhooks** and click **New endpoint**.
2. Enter a **Name** your team will recognise and the **URL** to send to. It must start with `https://`.
3. Optionally add a **Description**.
4. Under **Event subscriptions**, tick the events to send. Tick a group's header to take every event in it.
5. Click **Create endpoint**.
6. Copy the **Signing secret** from the dialog and give it to whoever runs the receiver. It's shown only once.

## Change an endpoint

Click it in the list, make your changes and click **Save changes**.

- Switch off **Status** to pause it. A paused endpoint gets nothing for events that happen meanwhile; deliveries already queued are still sent.
- **Rotate secret**, under **Danger zone**, issues a new signing secret and shows it once. The old one stops working immediately, so update the receiver first.
- **Delete endpoint** removes it and drops its queued deliveries.

## Which events an endpoint receives

The events it subscribes to that concern your organization, including events about its members, such as a member signing in, and instance-wide events, such as a feature being switched on. Endpoints that receive every event on the instance can be set up only by a [system administrator](../../reference/system-administrator-actions.md).

## When an endpoint keeps failing

Each delivery is tried up to 5 times, with longer waits in between. If one fails every attempt and nothing has succeeded since, the endpoint switches to **Disabled** and admins are notified. The list marks failing endpoints; filter by **Failing** to find them. Fix the receiver, then switch **Status** back on.

Next: [Check webhook deliveries](check-webhook-deliveries.md)
