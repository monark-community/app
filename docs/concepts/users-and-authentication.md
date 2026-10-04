---
type: concept
---

# Users and authentication

Supabase Auth owns sign-in and sessions; Monark owns everything else about a person. Every Supabase account has a matching row in Monark's `User` table with the same id, and that row carries the profile, preferences and lifecycle state. Three core modules share the work: `@monark/auth` (sign-in, two-factor, devices, account lifecycle), `@monark/users` (the user record and profile) and `@monark/organizations` (membership and invitations).

## Who a user is

A user is either a person, whose id is their Supabase account id, or a service account, a machine principal whose id starts with `svc_` and that exists only to own API keys. Service accounts never sign in and never receive notifications.

A person's public identity is their display name and email; there are no usernames. Their profile also holds an avatar, banner, short bio, preferred language (English or French), and how long their devices stay trusted.

Every other module asks `@monark/users` who a user is, through its read interface, rather than querying the table itself. A module that needs to store its own per-user setting uses the [metadata sidecar](architecture/modules-and-tiers.md#where-a-module-keeps-its-data) instead of adding a column.

## How a request is authenticated

1. The person signs in through Supabase, with email and password or with a social provider (GitHub, Google or Microsoft, as the deployment [enables](../operate/set-up-social-sign-in.md)).
2. The web app sends the Supabase access token as a `Bearer` header on every API call.
3. The API verifies the token with Supabase and builds the request context: the user id, the active organization, and a request id for logs.
4. Each procedure then checks [permissions](permissions.md) against that user.

The public REST API is the exception: it authenticates with API keys instead of sessions. See [Identity and integration](identity-and-integration.md).

On sign-up, Monark checks new passwords against local rules and against known breaches (a k-anonymity lookup that sends only a hash prefix). If the breach service is unreachable, the check passes rather than blocking sign-up.

## Two-factor and trusted devices

Two-factor sign-in uses authenticator-app codes (TOTP), implemented in Monark's own schema rather than Supabase's. The secret is encrypted at rest and the ten recovery codes are stored hashed. When a challenge is pending after the password step, middleware sends the browser to the code prompt until it's answered.

Admins must enrol in two-factor within seven days of their first sign-in.

A trusted device is a browser identified by a cookie, of which only a hash is stored. A device that has passed two-factor can skip the challenge until its trust expires. Revoking a device ends its sessions: the next page load on that browser fails the device check and signs it out. Revoking all devices is the emergency lockout.

Each of these behaviours sits behind a flag that is on by default; see [Feature flags](../reference/feature-flags.md).

## Belonging to the organization

Because a deployment has [one organization](platform-overview.md#one-deployment-one-organization), membership is automatic: whenever a user signs up or signs in, the organizations module makes sure they're a member. Invitations still exist to bring someone in with a role already assigned. An invite link carries a one-time token (only its hash is stored) and expires after 14 days. What a member can do comes from their roles; see [Permissions](permissions.md).

## Account lifecycle

| State            | How it starts                            | Effect                                                                                                                                     |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Active           | Sign-up                                  | Normal use.                                                                                                                                |
| Pending deletion | The user, or an admin, requests deletion | A 14-day grace period. The user is confined to their account pages, where they can cancel. In-app notifications still arrive; email stops. |
| Deleted          | The grace period ends                    | A scheduled job removes the account.                                                                                                       |
| Disabled         | An admin lockout, reversible             | The account's API keys stop working.                                                                                                       |

Sign-ins, sign-outs, password and email changes, two-factor and device changes, and profile updates all emit domain events, so security notifications, webhooks and automations can react to them. See [Domain events](../reference/events.md).

## Limits

- Disabling a person's account blocks their API keys but doesn't end their browser sessions or stop them signing in.
- There's no screen for disabling a person; it's done through an automation step.
- Each user belongs to the one organization; there is no organization switcher.

## Related

- [Your account](../use/account/_index.md)
- [People and access](../administer/people-and-access/_index.md)
- [Permissions](permissions.md)
- [Notifications](notifications.md)
