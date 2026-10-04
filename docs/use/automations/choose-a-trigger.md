---
type: how-to
---

# Choose a trigger

The trigger decides when a flow runs. A new flow starts with an **Event Trigger**. To use a different kind, right-click the trigger, choose **Replace**, and pick one.

## When something happens in the app

1. Click the **Event Trigger**.
2. Under **When this event fires**, pick an event, such as a user signing in or a role being assigned.

The **Outputs** section lists what the event carries, ready to use in later steps. Every event is described in [Domain events](../../reference/events.md).

## When a record changes in one model

1. Replace the trigger with **Data Record**.
2. Choose the **Data model**, then under **On** choose **Record created**, **Record updated** or **Record deleted**.

Only records in that model start the flow.

## On a schedule

1. Replace the trigger with **Schedule**.
2. Choose how often: **On an interval** (every so many minutes), **Daily**, **Weekly**, **Monthly (by date)** or **Monthly (by weekday)**, then set the details and time. Times are in your own time zone.

**Next run** shows when it will next fire. A schedule only fires while the flow is on.

## When another system calls it

1. Replace the trigger with **HTTP Trigger**.
2. Click **Generate secret**, then **Save changes**.
3. Give the other system the **Endpoint URL** and the **Secret**. It sends a `POST` to the URL with the secret in an `Authorization: Bearer` header.

Later steps read the request body as `{{ trigger.body }}`.

## Only when you start it

Replace the trigger with **Manual Trigger**. The flow never runs by itself; it runs when you click **Run now**.

Next: [Use values from earlier steps](use-values-from-earlier-steps.md)
