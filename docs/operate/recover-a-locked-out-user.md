---
type: runbook
---

# Recover a locked-out user

Get a user back into their account when the in-app recovery paths aren't enough. About 15 minutes plus the identity check; it changes one user's sign-in factors directly in the database.

Most lockouts don't need you:

| The user lost                          | They recover by                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| their password                         | **Forgot password?** on the sign-in page. If two-factor is on, the reset still asks for a code or a recovery code. |
| their authenticator                    | signing in with their password, then **Use a recovery code**. Each code works once.                                |
| their authenticator and recovery codes | this runbook                                                                                                       |
| the only administrator account         | this runbook, last section                                                                                         |

Never remove a factor on the strength of an email or chat message alone; an attacker who controls the user's inbox would get the whole account. Prove identity out of band first.

## Before you start

- [ ] Identity proven through a channel other than the account's email: a video call, a government ID, or details only the real user knows
- [ ] SQL access to the instance's database (Supabase SQL editor, or `psql` with the `DIRECT_URL`)

## Steps

1. Confirm the account exists and has two-factor enrolled:
   ```sql
   SELECT u.id, u.email, t."activatedAt"
   FROM "User" u JOIN "TotpSecret" t ON t."userId" = u.id
   WHERE u.email = lower('<user-email>');
   ```
   One row with an `activatedAt` date means two-factor is on.
2. Remove the enrollment. Its recovery codes are deleted with it:
   ```sql
   DELETE FROM "TotpSecret"
   WHERE "userId" = (SELECT id FROM "User" WHERE email = lower('<user-email>'));
   ```
   Expect `DELETE 1`.
3. Tell the user directly: this path sends no automatic email. Ask them to sign in with their password and set up two-factor again from their account security page, then save the new recovery codes. Administrators are prompted to re-enroll when two-factor is required for admins.
4. If they've also lost their password, they now use **Forgot password?** as usual.

## Verify

Rerun the query from step 1: it returns no rows. The user signs in with only their password.

## Restore administrator access

If nobody can reach the admin area (the only administrator left, or is locked out), grant the platform administrator role to an account you trust, from a checkout of the repository:

```sh
DATABASE_URL="<direct-url>" DIRECT_URL="<direct-url>" pnpm tsx tools/sysadmin.ts grant <email>
```

Expect `Granted SYSADMIN to <email> (id=…)`. Revoke it the same way with `revoke <email>` once a regular administrator is back.

## If something goes wrong

| Symptom                                 | Cause                                      | Fix                                                                                                    |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Step 1 returns no rows                  | wrong email, or two-factor wasn't enrolled | Search with `WHERE u.email ILIKE '%<part>%'`; without enrollment the user only needs a password reset. |
| Reset email never arrives               | mail delivery, not the account             | Check Supabase's SMTP settings and the provider's logs.                                                |
| `sysadmin` fails with `No user matched` | the account doesn't exist yet              | Have the person sign up and confirm their email first.                                                 |

Next: [Run several instances](run-several-instances.md)
