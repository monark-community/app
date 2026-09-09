# Admin section

For operators of an organization ; anyone with a Monark `ADMIN` (org-tier) or `SYSADMIN` (platform-tier) role. Visible to non-admins as a missing affordance : the admin pin doesn't appear in the primary navigation drawer, and `/admin` URLs redirect to the home page.

The admin section lives at `/admin/*` and ships eight tabs : **Organizations**, **Users**, **Roles & permissions**, **Webhooks**, **Data Models**, **Files**, **Secrets**, and **Service accounts**. Some tabs are gated by a feature flag and only appear when it's turned on for the deploy.

## In this section

- **[Reaching `/admin`](reaching-admin.md)**
- **[A note on tenancy](a-note-on-tenancy.md)**
- **[Organizations](organizations.md)**
- **[Users](users.md)**
- **[Roles & permissions](roles-permissions.md)**
- **[TOTP enforcement on admins](totp-enforcement-on-admins.md)**
- **[Webhooks](webhooks/_index.md)**
- **[Data Models](data-models.md)**
- **[Files](files.md)**
- **[Secrets](secrets.md)**
- **[Service accounts](service-accounts.md)**
- **[Automation integrations](automation-integrations.md)**
- **[Achievements](achievements.md)**
- **[Audit + observability](audit-observability.md)**
- **[What admins _can't_ do today](what-admins-cant-do-today.md)**
