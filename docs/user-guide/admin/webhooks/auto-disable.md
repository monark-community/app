# Auto-disable

After 5 consecutive failed deliveries the endpoint flips to Disabled automatically. The failure counter resets on the next successful delivery. When auto-disabled :

- The endpoint appears with a Disabled badge + a warning showing the failure count.
- New events stop generating deliveries for this endpoint.
- Pre-existing pending deliveries still drain.
- An in-app + email notification is sent to admins.

To re-enable : open the endpoint's edit page and set status back to Active.
