# Per-service plan

### `services/api`

Express app + tRPC router export + bootstrap + cron endpoint.

- **Have** : nothing.
- **Add** :
  - `server.test.ts` (integration) ; boot the Express app against a Postgres testcontainer ; assert the `/health` endpoint returns 200 ; tRPC procedures registered on `/trpc` are reachable.
  - `cron.test.ts` (integration) ; `POST /cron/process-account-deletions` requires `Authorization: Bearer $CRON_SECRET` ; with the right token, it sweeps expired rows ; with the wrong token, returns 401.
  - `bootstrap-from-env.test.ts` (integration) ; `INITIAL_ORG_*` env vars provision the singleton on first boot ; second boot against a healthy install is a no-op ; mismatch between env and DB logs a warning instead of erroring.
- **Coverage target** : 70 % (a lot of the api is plumbing ; lower threshold for this service).

### `services/web`

Next.js app. Server actions, client islands, page routes.

The right unit-of-test for a web page is the _server action_ (a pure async function with typed inputs / outputs) and the _interactive island_ (a React component with local state). Pages themselves are mostly composition + auth gates ; e2e covers those.

- **Have** : nothing under `services/web/tests/components/` ; only e2e specs.
- **Add** :
  - **Server actions** ; one suite per `actions.ts` file. Stubs the `@monark/*/server` calls + the Supabase admin client. Covers happy path + every documented error code.
    - `(authed)/account/actions.test.ts` ; `changePasswordAction`, `requestEmailChangeAction`, `verifyEmailChangeOtpAction`, `setLocalePreferenceAction`, `requestAccountDeletionAction`, `cancelAccountDeletionAction`, `uploadAvatarAction`, `uploadBannerAction`.
    - `(authed)/admin/users/admin-actions.test.ts` ; `adminSendPasswordResetAction`, `adminUploadUserAvatarAction`, `adminUploadUserBannerAction`.
    - `(authed)/admin/organizations/actions.test.ts` ; `adminUploadOrgLogoAction`.
    - `(anon)/signin/actions.test.ts` ; `signInAction`, `signOutAction`, post-signin grace-redirect logic.
    - `(anon)/signup/actions.test.ts` ; `signUpAction`, `resendConfirmationAction`.
    - `auth/reset-password/actions.test.ts` ; TOTP gate fires for enrolled users ; missing-code rejects ; wrong-code rejects ; right-code lands the new password.
  - **Client components** ; only the ones with non-trivial state. Skip presentational primitives.
    - `app-bar-breadcrumb.test.tsx` ; renders correctly for static URLs, dynamic ids, the truncation rule, the non-navigable list (`/admin` muted), single-tenant non-navigable additions, mobile single-segment mode.
    - `notifications-bell.test.tsx` ; badge count, drawer open / close, filter tab switching, mark-read / mark-unread / dismiss invalidations, empty state.
    - `app-launcher.test.tsx` ; renders APPS list + the empty-slot card ; external apps open in new tab ; current pill renders.
    - `user-menu.test.tsx` ; banner falls back to the gradient when no banner is set ; "About you" links navigate to the right routes ; logout fires `signOutAction`.
    - `account-sidebar.test.tsx` ; active state matches the pathname ; grace-period filter hides security + notifications tabs.
    - `password-section.test.tsx` ; modal opens / closes, mismatch detection, strength meter integration, TOTP dialog handoff for enrolled users.
    - `email-change-form.test.tsx` ; form → verify stage transition, OTP retry on the other inbox, dialog state persistence across stage flips.
    - `totp-section.test.tsx` ; the 2-step enroll wizard ; the disable + regenerate dialogs ; recovery codes copy ; secret codeblock copy.
    - `role-editor.test.tsx` ; create / edit / delete paths ; tri-state checkboxes (none / some / all) ; permission search auto-expands matching categories ; built-in ADMIN locks the grid.
    - `roles-manager.test.tsx` ; search filter, click-row navigation, "New role" link carries the org id.
    - `users-list.test.tsx` ; search, filter chips clear individually, invite dialog mount, paginated load-more.
- **Coverage target** : 75 % overall ; 80 % on `src/app/(authed)/**/actions.ts` files specifically (those are the security-sensitive surface).
