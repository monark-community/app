# preflight

Verifies that a deployment is actually configured, and stands in front of the app when it isn't.

The problem this solves: a misconfigured deploy fails **late and unhelpfully**. A blank `DATABASE_URL` surfaces as a Prisma stack trace during the first request ; an unquoted `BRANDING_PRIMARY=#2563EB` silently resolves to an empty string and the app just looks wrong ; a `BRANDING_LOGO_SRC` pointing at a file nobody added is a broken image on the sign-in page. None of those name themselves. Preflight checks them up front and prints the fix.

## Three modes, one check engine

```sh
pnpm preflight                              # report and exit ; 0 = safe to start
pnpm preflight --verbose                    # include the passing checks
pnpm preflight --json                       # machine-readable, for a pipeline
pnpm preflight --serve --port 3000          # just hold a port with the checklist
pnpm dev:guarded                            # gate `turbo run dev` behind the checks
```

`--gate` is the mode that matters in a deploy:

```sh
pnpm preflight --gate --port 3000 -- pnpm start
```

If every check passes it execs the command immediately and gets out of the way, propagating the child's exit code so a supervisor sees the app's status rather than preflight's. If anything fails it **does not start the app**. Instead it binds the port the app would have taken and serves the checklist there, returning `503` so a load balancer or uptime check reads it as "not ready". It keeps re-checking ; the moment the configuration is fixed it releases the port and hands over to the real command, with no restart.

That is the "spawns before the app" behaviour: on a fresh or broken deployment, opening the app's URL tells you what is missing instead of showing a connection refused or a half-booted app.

`GET /preflight.json` on the setup server returns the same data as JSON (`200` when ready, `503` when not), so a deploy pipeline can gate on it.

## What it checks

| Group               | Checks                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**         | Node 22+                                                                                                                                                                                          |
| **API environment** | `packages/db/.env` + `services/api/.env` exist ; `DATABASE_URL`, `DIRECT_URL`, the Supabase URL + both keys, `WEB_ORIGIN`, `APP_URL` ; the three at-rest secrets are present **and** 32 bytes hex |
| **Web environment** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, the server-only `SUPABASE_SECRET_KEY` ; and that the secret key is **not** exposed as `NEXT_PUBLIC_*`  |
| **Branding**        | `BRANDING_APP_NAME` set ; `BRANDING_PRIMARY` / `INITIAL_ORG_PRIMARY_COLOR` are valid hex ; the `NEXT_PUBLIC_` mirror matches the server value                                                     |
| **Assets**          | the file `BRANDING_LOGO_SRC` points at exists ; `favicon.ico` is present                                                                                                                          |
| **Connectivity**    | the database and Supabase accept TCP connections (`--skip-network` to skip)                                                                                                                       |

Failures block the app. Warnings do not — an unbranded deploy still runs, it just tells you it will call itself "App".

## Why it reads the `.env` files itself

Reading `process.env` would miss the failure this tool most wants to catch. Node's `--env-file` parser (and dotenv, and the Render dashboard) treat an unquoted `#` as the start of a comment, so:

```sh
BRANDING_PRIMARY=#2563EB     # parses as ""
BRANDING_PRIMARY="#2563EB"   # parses as "#2563EB"
```

From `process.env` both a mis-quoted value and an absent one look identical — the variable is simply not there — and they need completely different fixes. By parsing the file, preflight can say _"set on line 30 but parses as empty : the value starts with an unquoted `#`"_ and hand back the quoted form to paste. [`env-file.ts`](./env-file.ts) reimplements just enough of that parser to predict what the runtime will see.

The real environment still wins over the file when both carry a value, matching how a container or a Render dashboard overrides a checked-in `.env`.

## Layout

| File                           | Role                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [`env-file.ts`](./env-file.ts) | `.env` parsing + the quoting-trap detection. Pure ; this is where the tests are.                                         |
| [`checks.ts`](./checks.ts)     | Check definitions and the runner. Never throws — a preflight tool that crashes is worse than one that reports "unknown". |
| [`render.ts`](./render.ts)     | Terminal report and the standalone HTML page.                                                                            |
| [`serve.ts`](./serve.ts)       | The setup server. Re-runs the checks per request so the page reflects disk, not a cached run.                            |
| [`cli.ts`](./cli.ts)           | Argument parsing and the three modes.                                                                                    |

Node builtins only — no dependencies. It runs in front of the app, including in a container, so it must not need anything the app needs.

## Tests

```sh
pnpm test            # the whole workspace, tools included
pnpm --filter @monark/tools test
```

`tools/` is a workspace package (`@monark/tools`), so its tests run under vitest in the same `pnpm test` and the same CI gate as everything else. The `.env` parser is where the subtle logic lives, so that is where the tests are.

## Adding a check

Add a `CheckResult` to the relevant group in [`checks.ts`](./checks.ts). Two rules:

1. **Every failure carries a `fix`** that is concrete enough to paste. "Invalid configuration" helps nobody ; the whole value of this tool is that the next action is on screen.
2. **Fail only what genuinely blocks startup.** Everything else is a warning. A tool that cries wolf gets bypassed, and a bypassed gate protects nothing.
