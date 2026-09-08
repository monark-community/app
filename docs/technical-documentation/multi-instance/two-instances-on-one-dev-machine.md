# Two instances on one dev machine

Everything above is about production. Locally, the constraint is different :
every instance wants the _same_ fixed ports, and `CLAUDE.md` asks each agent to
work in its own worktree ; so running two checkouts side by side is the normal
case, not an exotic one.

A second local instance needs three edits in the second worktree :

1. **`supabase/config.toml`** : a distinct `project_id` (this is what names the
   Docker containers, so it's what actually keeps the two stacks apart), a
   shifted port block, and `[auth] site_url`. Shift the ports all together, e.g.
   `54321`→`55321` : `[api] port`, `[db] port` + `shadow_port`,
   `[db.pooler] port`, `[studio] port`, `[inbucket] port` + `smtp_port`,
   `[analytics] port`.

   Don't skip `site_url`. Supabase builds the links in its own auth emails
   (signup confirmation, password reset, email change) from it, so leaving it at
   `http://localhost:3000` sends every recovery link to the _other_ instance —
   which redeems it against a different Supabase project and shows the user
   `Link expired`. Add the second instance's origin to
   `additional_redirect_urls` too.

   Changes here need `pnpm exec supabase stop && pnpm exec supabase start` to
   take effect ; the email templates and subjects are read into the running
   container at boot, so editing them alone does nothing until you restart.

2. **`services/web/package.json`** : the `dev` script pins `--port 3000`. Change
   it to the second instance's port. It is a literal flag on purpose : Next
   resolves its port _before_ loading `.env`, so a `PORT=` line there is ignored,
   and passing `PORT` through the environment instead leaks into the api's
   process too (Node's `--env-file` does not override an already-set variable),
   which lands both services on the same port.
3. **The `.env` files** : `PORT` for the api, and `WEB_ORIGIN` / `APP_URL` /
   `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` / the `SUPABASE_URL` pair /
   `SMTP_URL` to match the shifted ports. `pnpm bootstrap` fills the DB URL and
   Supabase keys from whatever `supabase status` reports, so it picks up the
   shift on its own ; the origin URLs are yours to set.

The first two are local-only edits ; don't commit them.
