# Routing

Endpoints can be scoped to a single organization or to the entire platform :

- **Platform-tier** (no organization selected) ; receives every matching event regardless of source org. Use for sysadmin / SIEM / audit-log integrations.
- **Org-scoped** ; receives events that carry a matching `organizationId`, plus user-tied events (sign-in, password change, TOTP changes) for users who are members of that org.
