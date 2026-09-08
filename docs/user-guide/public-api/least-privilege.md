# Least privilege

Two ways to hand out _less_ than full access:

1. **A limited personal key** : pick a subset of your own permissions when you
   create it (above). Good for your own scripts.
2. **A service account** : an org-owned "machine" identity with its own roles,
   created by an admin under **Admin → Service accounts** (behind the
   `public-api.service-accounts` flag). Its keys act as the account, not a
   person, so they survive staff changes and attribute cleanly. Give the account
   a read-only role and its keys are read-only. This is the right choice for a
   shared, long-lived integration.

Either way, the ceiling is only ever _narrower_ than the owning account: a key's
effective rights are its allowlist **intersected with the account's current
permissions**. If the account loses a permission, the key loses it too, the same
moment : nothing to re-issue.
