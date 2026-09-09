# The one-sentence version of each

| Primitive                                                              | The question it answers                                         | Direction                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| **Secrets** ([`@monark/secrets`](../../../packages/secrets/README.md))    | "How does _Monark_ prove who it is to someone else's system ?"  | Monark to outward ; a credential |
| **API keys** ([`@monark/api-keys`](../../../packages/api-keys/README.md)) | "How does _someone else_ prove who they are to Monark ?"        | Outward to Monark ; a credential |
| **Service accounts** (same module)                                     | "_Whose_ permissions does a machine caller have ?"              | An identity, not a credential    |
| **Webhooks** ([`@monark/webhooks`](../../../packages/webhooks/README.md)) | "How does someone else find out that something happened here ?" | Monark to outward ; events       |

Two axes, then: **direction** (who initiates) and **kind** (a credential versus an identity versus an
event stream). Laid out that way the whole surface fits in one table.
