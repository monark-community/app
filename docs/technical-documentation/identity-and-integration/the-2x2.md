# The 2x2

|                        | **They call us** (inbound)                                                                                                                                                                 | **We call them** (outbound)                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Request / response** | An **API key** on `Authorization: Bearer mrk_...` hits `/api/v1`, resolves to a **principal** (a human `User` or a **service account**), and that principal's live RBAC decides everything | An **automation action node** calling out through `safeFetch`, authenticating with a value pulled from **Secrets** via `ctx.getSecret(name)`                    |
| **Event push**         | **Inbound hooks** ; `POST /hooks/automation/:id` (per-automation `atrig_` secret), `/hooks/github/:org` (HMAC), `/hooks/telegram/:org` (header echo). Each fires an **automation**         | **Webhooks** ; a domain event reaches the wildcard subscriber, lands in the `WebhookDelivery` outbox, and is POSTed signed with that endpoint's `whsec_` secret |

**Automation is the thing in the middle.** It is triggered by events (from the in-memory bus, or from an
inbound hook), it acts using secrets, and it runs _as_ a principal. Every one of the four primitives is
either an input to it or a sibling of it. See [`automation.md`](../automation/_index.md).
