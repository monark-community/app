---
type: runbook
---

# Run a second instance on your machine

Run two fully separate local instances side by side, each with its own Supabase stack, for example to test two brandings or two database states. About 20 minutes. If you only need a second checkout of the code, `pnpm agent wt new` already gives it its own web and api ports and shares the one local Supabase; this runbook is for a second Supabase too.

## Before you start

- [ ] A second checkout of the repository with `pnpm install` done
- [ ] Docker running, and the first instance's Supabase on its default ports (54321 and up)

## Steps

Do every step in the second checkout. None of these edits are meant to be committed.

1. In `supabase/config.toml`, set a different `project_id` (it names the Docker containers, which is what keeps the two stacks apart), for example `project_id = "app2"`.
2. In the same file, shift every port by the same amount, for example +1000:

   | Section       | Keys                  | Default → shifted            |
   | ------------- | --------------------- | ---------------------------- |
   | `[api]`       | `port`                | 54321 → 55321                |
   | `[db]`        | `port`, `shadow_port` | 54322 → 55322, 54320 → 55320 |
   | `[db.pooler]` | `port`                | 54329 → 55329                |
   | `[studio]`    | `port`                | 54323 → 55323                |
   | `[inbucket]`  | `port`, `smtp_port`   | 54324 → 55324, 54325 → 55325 |
   | `[analytics]` | `port`                | 54327 → 55327                |

3. Still in `[auth]`, set `site_url` to the second web app's origin (for example `http://localhost:3010`) and add it to `additional_redirect_urls`. Supabase builds the links in its auth emails from `site_url`; left at the default, every confirmation and reset link opens the first instance and fails with "Link expired".
4. Start the second stack and fill the env files from it. `pnpm bootstrap` starts Supabase, copies any missing `.env` files, fills empty database URLs, Supabase keys and secrets from `supabase status`, and applies migrations; it never overwrites a value you set:
   ```sh
   pnpm bootstrap
   ```
5. Set the ports and origins by hand:
   - `services/web/.env.local`: `PORT=3010`
   - `services/api/.env`: `PORT=4010`, `WEB_ORIGIN` and `APP_URL` to `http://localhost:3010`, `SMTP_URL=smtp://localhost:55325`, and `SUPABASE_URL=http://127.0.0.1:55321`
   - `services/web/.env`: `NEXT_PUBLIC_API_URL=http://localhost:4010`, `NEXT_PUBLIC_APP_URL=http://localhost:3010`, and both Supabase URLs to `http://127.0.0.1:55321`

   Don't export `PORT` in your shell instead: both services would read it and collide.

6. Start the app:
   ```sh
   pnpm dev
   ```

## Verify

Open `http://localhost:3010`, sign up, and open the confirmation email in the second stack's mail viewer at `http://127.0.0.1:55324`. The link opens `localhost:3010`, not the first instance.

## If something goes wrong

| Symptom                                        | Cause                                         | Fix                                                           |
| ---------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `supabase start` reports ports in use          | a port left unshifted                         | Shift every port in step 2.                                   |
| Starting one stack stops or reuses the other   | same `project_id`                             | Change it as in step 1.                                       |
| Email links show "Link expired"                | `site_url` still points at the first instance | Fix step 3, then `pnpm supabase stop && pnpm supabase start`. |
| Template or `config.toml` edits have no effect | the stack reads them only at start            | Restart the stack.                                            |

Next: [Maintain the CI pipeline](ci.md)
