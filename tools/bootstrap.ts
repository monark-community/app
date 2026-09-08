import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One-command bootstrap for a fresh checkout. Idempotent : re-running
 * on a healthy install is a no-op except for the supabase + migrate
 * steps which are themselves cheap when already up to date.
 *
 * Steps :
 *   1. Sanity-check Node + pnpm + Docker
 *   2. Copy .env.example → .env where the .env doesn't exist yet
 *      (NEVER overwrites — operator-set values stay put)
 *   3. pnpm install (skipped when node_modules looks healthy)
 *   4. supabase start (Postgres + Auth + Inbucket on :54321/22/24)
 *   5. Wire the copied .env files to the stack that just started
 *      (DB URLs + Supabase keys read back from `supabase status`,
 *      at-rest secrets generated locally) — blanks only, never
 *      overwriting a value the operator already set
 *   6. pnpm db:migrate (Prisma migrate deploy against the local stack)
 *
 * Out of scope (manual steps a contributor still does themselves) :
 *   - Anything that isn't local : real SMTP credentials, a Sentry DSN,
 *     production Supabase keys. The `.env.example` files surface those
 *     with inline notes.
 *   - Seeding e2e test users (run `pnpm tsx tools/seed-e2e-users.ts`
 *     when you specifically want to drive the gated e2e specs).
 *
 * Usage : `pnpm bootstrap`. Add `--no-supabase` to skip the docker /
 * supabase steps when you only want the install + env-copy phase.
 *
 * Runs under `node --experimental-strip-types`, NOT `tsx` : this is the
 * first command a fresh checkout runs, and `tsx` is a workspace
 * devDependency that doesn't exist until step 3 has finished. Keep this
 * file to plain type annotations (no enums, no namespaces, no path
 * aliases, no workspace imports) so type-stripping stays sufficient.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

const ESC_GREEN = "\x1b[32m";
const ESC_YELLOW = "\x1b[33m";
const ESC_RED = "\x1b[31m";
const ESC_DIM = "\x1b[2m";
const ESC_RESET = "\x1b[0m";

function log(stage: string, message: string): void {
  console.log(`${ESC_GREEN}▸${ESC_RESET} ${ESC_DIM}[${stage}]${ESC_RESET} ${message}`);
}

function warn(stage: string, message: string): void {
  console.log(`${ESC_YELLOW}!${ESC_RESET} ${ESC_DIM}[${stage}]${ESC_RESET} ${message}`);
}

function fail(stage: string, message: string): never {
  console.error(`${ESC_RED}✗${ESC_RESET} ${ESC_DIM}[${stage}]${ESC_RESET} ${message}`);
  process.exit(1);
}

function run(cmd: string, cwd = APP_ROOT): void {
  execSync(cmd, { cwd, stdio: "inherit" });
}

function tryRun(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output };
  } catch (err) {
    const e = err as { stderr?: Buffer; message?: string };
    return { ok: false, output: e.stderr?.toString() ?? e.message ?? "" };
  }
}

function checkNode(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isNaN(major) || major < 22) {
    fail(
      "node",
      `Node 22+ required (have ${process.versions.node}). The .nvmrc pins v22 ; install with nvm / fnm / volta.`,
    );
  }
  log("node", `${process.versions.node} (>=22 required) ✓`);
}

function checkPnpm(): void {
  const result = tryRun("pnpm --version");
  if (!result.ok) {
    fail(
      "pnpm",
      "pnpm not found on PATH. Install with `corepack enable` (Node 22+ ships corepack), or `npm install -g pnpm`.",
    );
  }
  log("pnpm", `${result.output.trim()} ✓`);
}

function checkDocker(skipSupabase: boolean): void {
  if (skipSupabase) {
    warn(
      "docker",
      "skipped (--no-supabase) ; remember to run `pnpm exec supabase start` before `pnpm dev`.",
    );
    return;
  }
  const result = tryRun("docker info");
  if (!result.ok) {
    fail(
      "docker",
      "Docker daemon not reachable. Supabase's local stack runs in containers ; install Docker Desktop / OrbStack / colima and start it. Skip this step with `pnpm bootstrap --no-supabase` if you'll run supabase manually.",
    );
  }
  log("docker", "daemon reachable ✓");
}

function copyMissingEnvFiles(): void {
  // Walk known service / package dirs that ship a `.env.example`. We
  // don't auto-discover the whole tree because the gen / merge tools
  // each have their own `.env.example` too and we want explicit
  // control over which files get instantiated.
  const targets = [
    { dir: ".", file: ".env" },
    { dir: "packages/db", file: ".env" },
    { dir: "services/api", file: ".env" },
    { dir: "services/web", file: ".env" },
  ];
  for (const target of targets) {
    const dirAbs = resolve(APP_ROOT, target.dir);
    const examplePath = resolve(dirAbs, `${target.file}.example`);
    const targetPath = resolve(dirAbs, target.file);
    if (!existsSync(examplePath)) continue;
    if (existsSync(targetPath)) {
      log("env", `${relative(APP_ROOT, targetPath)} already exists, leaving in place`);
      continue;
    }
    copyFileSync(examplePath, targetPath);
    log("env", `copied ${relative(APP_ROOT, examplePath)} → ${relative(APP_ROOT, targetPath)}`);
  }
}

/**
 * Read the values `supabase start` just published. `status -o env`
 * prints `KEY="value"` lines for the whole local stack (DB_URL,
 * API_URL, PUBLISHABLE_KEY, SECRET_KEY, …), which is where the
 * connection details a fresh checkout needs actually live — they
 * depend on `supabase/config.toml`, so hardcoding them here would
 * quietly break any deploy that shifted a port.
 */
function readSupabaseStatus(): Record<string, string> {
  const result = tryRun("pnpm exec supabase status -o env");
  if (!result.ok) return {};
  const out: Record<string, string> = {};
  for (const line of result.output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] && match[2]) out[match[1]] = match[2];
  }
  return out;
}

/**
 * Set `key=value` in a `.env`, but ONLY when the key is present and
 * blank. Same contract as the env *copy* step : a value the operator
 * has already set is never touched, so re-running bootstrap on a
 * configured install is a no-op. A key the file doesn't declare is
 * skipped rather than appended — the `.env.example` is the schema.
 *
 * Returns the keys it actually wrote, for the log line.
 */
function fillBlankEnvValues(relPath: string, values: Record<string, string>): string[] {
  const target = resolve(APP_ROOT, relPath);
  if (!existsSync(target)) return [];
  const original = readFileSync(target, "utf8");
  const written: string[] = [];
  const updated = original
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([A-Z0-9_]+)=\s*$/.exec(line);
      const key = match?.[1];
      if (!key) return line;
      const value = values[key];
      if (!value) return line;
      written.push(key);
      // Quote unconditionally : a hex colour (or any value with a `#`)
      // is otherwise truncated to "" by Node's --env-file parser.
      return `${key}="${value}"`;
    })
    .join("\n");
  if (written.length > 0) writeFileSync(target, updated, "utf8");
  return written;
}

/** 32 bytes, hex-encoded — the shape every at-rest key in this repo takes. */
function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Point the copied `.env` files at the stack that just started.
 *
 * Without this the copied files carry the `.env.example` blanks, and
 * the very next step (`db:migrate`) fails on an empty `DATABASE_URL`
 * — the stack is up, but nothing knows how to reach it. The three
 * at-rest secrets are generated rather than read : they're local-only
 * dev keys, and `development.md` otherwise asks the reader to run the
 * same `randomBytes(32)` command three times by hand.
 */
function wireEnvToLocalStack(skipSupabase: boolean): void {
  if (skipSupabase) {
    warn(
      "wire-env",
      "skipped (--no-supabase) ; set DATABASE_URL / DIRECT_URL yourself before `pnpm db:migrate`.",
    );
    return;
  }

  const status = readSupabaseStatus();
  const dbUrl = status.DB_URL;
  if (!dbUrl) {
    warn("wire-env", "couldn't read `supabase status` ; leaving the .env files as copied.");
    return;
  }

  const apiUrl = status.API_URL ?? "";
  const publishable = status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? "";
  const secret = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? "";

  const filled = [
    ...fillBlankEnvValues("packages/db/.env", { DATABASE_URL: dbUrl, DIRECT_URL: dbUrl }),
    ...fillBlankEnvValues("services/api/.env", {
      DATABASE_URL: dbUrl,
      DIRECT_URL: dbUrl,
      SUPABASE_URL: apiUrl,
      SUPABASE_PUBLISHABLE_KEY: publishable,
      SUPABASE_SECRET_KEY: secret,
      TOTP_ENCRYPTION_KEY: generateSecret(),
      SECRETS_ENCRYPTION_KEY: generateSecret(),
      CRON_SECRET: generateSecret(),
    }),
    ...fillBlankEnvValues("services/web/.env", {
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
      SUPABASE_URL: apiUrl,
      SUPABASE_SECRET_KEY: secret,
    }),
  ];

  if (filled.length === 0) {
    log("wire-env", "every value already set, nothing to fill ✓");
    return;
  }
  log("wire-env", `filled ${filled.length} blank values from the local stack ✓`);
}

function installDependencies(): void {
  // Cheap heuristic for "node_modules looks healthy" : the root has a
  // pnpm-managed node_modules and the lockfile hasn't changed since
  // the last install. We always run pnpm install ; pnpm itself is
  // smart enough to no-op when nothing changed (under 1s).
  log("install", "running pnpm install --frozen-lockfile");
  run("pnpm install --frozen-lockfile");
}

function startSupabase(skipSupabase: boolean): void {
  if (skipSupabase) {
    warn("supabase", "skipped (--no-supabase)");
    return;
  }
  // `supabase status` exits non-zero when the stack isn't running.
  // `supabase start` is idempotent — it warm-starts a stopped
  // project + reports if it's already up.
  log("supabase", "starting local stack (Postgres + Auth + Inbucket)");
  run("pnpm exec supabase start");
}

function migrateDatabase(skipSupabase: boolean): void {
  if (skipSupabase) {
    warn(
      "migrate",
      "skipped (--no-supabase) ; run `pnpm db:migrate` manually after starting your DB.",
    );
    return;
  }
  log("migrate", "applying Prisma migrations against the local DB");
  try {
    run("pnpm db:migrate");
  } catch {
    // `run` uses stdio: "inherit", so Prisma has already printed the real
    // error above. Swallow the execSync stack trace — it points at this
    // file rather than at anything the reader can act on — and land on a
    // diagnosis instead. The overwhelmingly common cause on a fresh
    // checkout is a `packages/db/.env` that never got a DATABASE_URL.
    fail(
      "migrate",
      "prisma migrate deploy failed (see the Prisma output above).\n" +
        "  Most often : packages/db/.env has an empty DATABASE_URL / DIRECT_URL.\n" +
        "  Check it against `pnpm exec supabase status -o env` (the DB_URL line),\n" +
        "  then re-run `pnpm db:migrate`.",
    );
  }
}

function printNextSteps(): void {
  console.log("");
  console.log(`${ESC_GREEN}✓ Bootstrap done.${ESC_RESET}`);
  console.log("");
  console.log(`Next steps :`);
  console.log(`  ${ESC_DIM}# Open the app + watch the api / web servers${ESC_RESET}`);
  console.log(`  pnpm dev`);
  console.log(`  ${ESC_DIM}# Inbucket (mail catcher) at http://localhost:54324${ESC_RESET}`);
  console.log(`  pnpm dev:tools:mail`);
  console.log(`  ${ESC_DIM}# Provision e2e test users (optional)${ESC_RESET}`);
  console.log(`  pnpm tsx tools/seed-e2e-users.ts`);
  console.log("");
  console.log(
    `${ESC_DIM}Note : the .env files are wired to the LOCAL Supabase stack, with${ESC_RESET}`,
  );
  console.log(
    `${ESC_DIM}freshly generated dev-only at-rest keys. Anything non-local (SMTP,${ESC_RESET}`,
  );
  console.log(
    `${ESC_DIM}Sentry, branding) is still blank — see each .env.example. Real${ESC_RESET}`,
  );
  console.log(`${ESC_DIM}production values stay out of the repo.${ESC_RESET}`);
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const skipSupabase = args.has("--no-supabase") || args.has("--skip-supabase");

  console.log(
    `${ESC_GREEN}Monark bootstrap${ESC_RESET}${ESC_DIM} — preparing fresh checkout${ESC_RESET}`,
  );
  console.log("");

  checkNode();
  checkPnpm();
  checkDocker(skipSupabase);
  copyMissingEnvFiles();
  installDependencies();
  startSupabase(skipSupabase);
  wireEnvToLocalStack(skipSupabase);
  migrateDatabase(skipSupabase);

  printNextSteps();

  // Sanity check : warn if the workspace ended up empty (rare ; usually
  // means pnpm install fell over silently in CI).
  const rootNodeModules = resolve(APP_ROOT, "node_modules");
  if (!existsSync(rootNodeModules) || readdirSync(rootNodeModules).length === 0) {
    warn(
      "post",
      "root node_modules is empty after bootstrap — install probably failed silently. Re-run pnpm install manually.",
    );
  }
}

main();
