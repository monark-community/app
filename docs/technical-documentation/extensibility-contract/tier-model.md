# Tier model

The repo has two tiers, locked by [tools/check-tiers.ts](../../../tools/check-tiers.ts) and the [modules.manifest.ts](../../../modules.manifest.ts) registry :

- **Core** modules (`@monark/auth`, `@monark/branding`, `@monark/feature-flags`, `@monark/users`, `@monark/organizations`, `@monark/rbac`, `@monark/notifications`, `@monark/webhooks`, `@monark/files`, `@monark/data-models`, `@monark/automation`, `@monark/secrets`, `@monark/api-keys`, `@monark/public-api`) ship with the platform. They may depend on each other and on `@monark/db` / `@monark/common`.
- **Extended** modules ship business logic on top. They may depend on any core module ; they may **not** depend on another extended module. The tier check fails CI if an extended module's `package.json` lists another extended package.

If a new module is fundamentally infrastructure (auth, billing, observability) it joins core. If it's a feature (posts, events, voting, contributions) it joins extended. The bar for entering core is high ; every core module is loaded by every deploy, even ones that don't use that feature.
