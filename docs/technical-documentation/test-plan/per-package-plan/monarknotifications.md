# `@monark/notifications`

Dispatch, prefs, templates, transport, subscribers.

- **Have** : `email.test.ts`, `enrich.test.ts`, `prefs.test.ts`, `registry.test.ts`, `template.test.ts`. Decent coverage of the rendering layer.
- **Add** :
  - **Email shell snapshot test** (already in [backlog](../../../todo/backlog.md)) ; calls `notify()` with a stubbed mailer, asserts the captured HTML contains no literal `{{` substrings. Catches the whole class of token-substitution regressions.
  - `dispatch.test.ts` (integration) ; an end-to-end `notify()` against a Postgres testcontainer + smtp-tester. Persists the row, fires the SMTP send, marks `deliveredAt`, emits `notification.created`.
  - `prefs.test.ts` extension ; the `requiredEmail` rule overrides any pref row for SECURITY × EMAIL ; resetting a user's prefs deletes every row in one query.
  - `subscribers.test.ts` ; each domain event (`user.password-changed`, `trusted-device.added`, …) fires the matching `notify()` call with the right payload ; idempotent registration (calling `registerNotificationSubscribers` twice doesn't double-bind).
  - `template.test.ts` extension ; locale branching renders the `fr` arm when locale is `fr`, falls back to `en` when locale is null. Unknown vars are left visible (template-author dev affordance).
- **Coverage target** : 80 %.
