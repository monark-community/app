# Delivery detail

`/admin/webhooks/<id>/deliveries/<deliveryId>`. Two sections :

- **Payload** ; the full JSON body that was (or would be) sent, pretty-printed.
- **Attempt log** ; one row per attempt showing HTTP status code (or network error), duration, and timestamp.

A **Retry now** button at the top fires one synchronous delivery attempt so you get immediate feedback. Subsequent retries go through the worker as usual.
