# Creating an endpoint

Click **New endpoint**. The create form asks for :

- **URL** ; HTTPS only in production. In development the validator also accepts HTTP for localhost, `127.0.0.1`, `[::1]`, and RFC 1918 private hosts (`10.x`, `172.16-31.x`, `192.168.x`). Anything else (public host over HTTP, `file://`, `ws://`) is rejected.
- **Description** (optional) ; a human-readable note for your team.
- **Subscriptions** ; a categorized picker driven by the runtime event-type registry. Each module that emits domain events gets a collapsible group with :
  - A **tri-state header checkbox** (none / some / all) to bulk-toggle every event in the module.
  - A **count chip** on the right showing `selected / total`.
  - One labelled checkbox per event type ; mono-font key + plain-language description.

  Ticking the header writes a single prefix subscription when every event in the module shares a common dotted prefix (e.g. `rbac.`) ; otherwise it writes N exact subscriptions.

Submitting creates the endpoint and reveals the **signing secret** in a green banner at the top of the edit page. **This is the only time the plaintext secret is visible.** Copy it now ; once you navigate away the only recovery path is rotating the secret (which generates a new one).
