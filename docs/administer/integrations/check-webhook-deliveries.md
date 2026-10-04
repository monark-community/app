---
type: how-to
---

# Check webhook deliveries

See what Monark sent to an endpoint, find out why a delivery failed, and send it again.

1. In **Admin**, open **Webhooks**, click the endpoint, then click **Open full page**.
2. Open the **Deliveries** tab. Each row shows the event, its status (**Delivered**, **Pending** or **Failed**), the number of attempts and when it was queued.
3. Click a delivery. **Payload** shows exactly what was sent. **Attempt log** shows each attempt's HTTP status or network error, how long it took and when.
4. To send it again, click **Retry now**. One attempt runs right away; refresh the attempt log to see the result.

Good to know: a **Pending** delivery is waiting for its next attempt, shown as **Next attempt**. A **Failed** one has used all its attempts and won't be tried again unless you retry it.

Next: [Create a service account](create-a-service-account.md)
