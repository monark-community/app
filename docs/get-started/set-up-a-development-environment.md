---
type: tutorial
---

# Set up a development environment

Go from a fresh clone to Monark running on your machine, with the tests passing and a change of your own visible in the browser. This is for developers who want to work on Monark itself. It takes about 20 minutes, most of it downloads.

## Before you start

- **Node 22 or later.** The repository's `.nvmrc` pins 22, so `nvm use` picks it up.
- **pnpm 10**, through Corepack: run `corepack enable` once.
- **Docker** (Docker Desktop, OrbStack or colima), running. The local Supabase stack and the integration tests use it.
- **Git** and a clone of the repository.

You don't need to install the Supabase CLI; it comes with the project's dependencies.

## Install and configure

1. In the repository root, select the Node version and run the bootstrap:
   ```sh
   nvm use
   pnpm bootstrap
   ```
2. Wait for it to finish. It checks your tools, copies every `.env.example` to `.env`, installs dependencies, starts the local Supabase stack, fills in the local database URLs, keys and secrets, and applies the database migrations.

Bootstrap never overwrites a value you've already set, so it's safe to run again. It leaves real outside services blank on purpose: SMTP, Sentry and your branding. Without SMTP, outgoing mail goes to the local mail catcher instead.

## Start the app

1. Start the web app and the api:
   ```sh
   pnpm dev
   ```
2. Open <http://localhost:3000>. You see the sign-in page. The api runs on <http://localhost:4000>.

If the api logs `Can't reach database server at localhost:54322`, the Supabase stack is down; start it with `pnpm exec supabase start` and run `pnpm dev` again.

## Create your account

1. On the sign-in page, click **Create one**, enter an email and a password, and click **Create account**.
2. Open the local mail catcher with `pnpm dev:tools:mail` (or go to <http://localhost:54324>), open the confirmation email, and click its link. You land in the app, already a member of the local organization.
3. Make yourself a system administrator so you can reach every admin screen:
   ```sh
   pnpm sysadmin grant you@example.com
   ```
4. Turn on the features that are off by default, such as the wiki, the assistant and the public API:
   ```sh
   pnpm enable:dev-flags
   ```
5. Reload the page. **Admin** and the extra areas now appear in the navigation.

## Run the tests

1. Run the unit and component tests. They need nothing running:
   ```sh
   pnpm test
   ```
2. Run one package's integration tests. Each run starts a throwaway Postgres container in Docker, so it never touches your development database:
   ```sh
   pnpm --filter @monark/calendar test:integration
   ```

Both finish with every test passing. `pnpm test:integration` runs every package's suite, one package at a time; it takes several minutes.

## Make a change

1. Open `services/web/src/messages/en.json` and find `"signIn"`, under `"auth"`.
2. Change `"title": "Welcome back"` to `"title": "Welcome back, developer"` and save.
3. Sign out from the user menu (**Logout**). The sign-in page shows your new heading without a restart.
4. Undo the change. Every visible string has to exist in both `en.json` and `fr.json`, and `pnpm check:i18n` fails otherwise.

## What you built

You have Monark running against a local Supabase stack, an account with full access, the tests passing, and the edit-reload loop working. Before you open a pull request, run the same checks CI runs; [Scripts](../reference/scripts.md) lists them.

Next, pick the job you came for in [Build on Monark](../build/_index.md): [add a module](../build/extend/add-a-module.md), [change the database schema](../build/extend/change-the-database-schema.md), or [write tests](../build/extend/write-tests.md). For how the pieces fit, read [Architecture](../concepts/architecture/_index.md).
