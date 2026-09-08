# The relationships, drawn

```
                domain event on the in-memory bus (best-effort, no durability)
                               |
          +--------------------+--------------------+
          |                                         |
 automation subscriber (first)            webhook subscriber (last)
          |                                         |
   AutomationRun outbox                     WebhookDelivery outbox
   worker 5s, 3 attempts                    worker 5s, 5 attempts
          |                                         |
   actor = Automation.createdBy             signed with whsec_ from SecretStore
          |                                    (NOT @monark/secrets)
          v
   ctx.getSecret(name) --> Secret (organizationId, key), AES-256-GCM
          |                        ^
          +-- safeFetch --> out    |  same store, fixed well-known keys
                                   |
  POST /hooks/{github,telegram}/:org  (inbound integration signing keys)


  Authorization: Bearer mrk_... --> ApiKey --> owner User (HUMAN | SERVICE)
                    |                                  |
                    |                            RoleAssignment --> RBAC
                    +-- fullAccess / permissions ceiling ---^
```
