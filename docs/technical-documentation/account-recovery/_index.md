# Account recovery

How a user gets unstuck after losing their authenticator, password, or both. This document describes the _strategy_ and the industry context ; concrete implementation lives in [`packages/auth`](../../../packages/auth) and the auth-related routes under [`services/web/src/app`](../../../services/web/src/app).

## In this section

- **[The recovery ladder](the-recovery-ladder.md)**
- **[Cross-cutting design rules](cross-cutting-design-rules.md)**

## What the user sees today

| Loss                           | Recovery path                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Password only                  | `/forgot-password` → email link / OTP → `/auth/reset-password` → set new password (TOTP gate runs if enrolled) |
| Authenticator only             | `/signin` → password → `/signin/totp` → "use recovery code" mode → enter 14-char code                          |
| Authenticator + recovery codes | Out-of-band support (rung 2) ; not yet implemented                                                             |
| Email + everything             | Out-of-band support ; not yet implemented                                                                      |


## Adding a new recovery factor

When you build rung 2 / 3 / 4 :

1. **Add a CHANGELOG entry** describing the threat model the new factor closes.
2. **Document the rung above** : when this factor is also lost, what's the next escape hatch ?
3. **Match the notification pattern** : every use of the new factor fires an email so the legitimate user can detect misuse.
4. **Update this document's "What the user sees today" table** so the recovery flow stays discoverable.
