# What extended modules guarantee to core

- **Idempotent registration.** Every `register<Module>*()` helper guards against double-registration so hot-reloads, test setups, and accidental double-imports don't crash.
- **Stable event payloads once shipped.** Once an extended module emits an event in production, treat the payload as a public API. Add fields ; don't rename or remove them. Subscribers (including webhook receivers) parse against the published shape.
- **Safe defaults.** A flag's `defaultOn` should be `false` for new behavior, `true` only for kill-switches over already-shipped behavior. A permission's category should match a category the /admin/rbac surface already renders, or introduce a new one consistently.
- **Module name = package name.** When an extended module is `@monark/posts`, register flags / permissions / kinds under module `posts`. Keeps the DB rows readable and the dotted-key form aligned with the package layout.
