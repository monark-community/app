import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
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
 *   5. pnpm db:migrate (Prisma migrate deploy against the local stack)
 *
 * Out of scope (manual steps a contributor still does themselves) :
 *   - Filling in real values in the copied .env files (Supabase keys,
 *     SMTP creds, etc.) ; the .env.example surfaces them with TODO
 *     comments.
 *   - Seeding e2e test users (run `pnpm tsx tools/seed-e2e-users.ts`
 *     when you specifically want to drive the gated e2e specs).
 *
 * Usage : `pnpm bootstrap`. Add `--no-supabase` to skip the docker /
 * supabase steps when you only want the install + env-copy phase.
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
      `Node 22+ required (have ${process.versions.node}). The .nvmrc pins v24 ; install with nvm / fnm / volta.`,
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
  run("pnpm db:migrate");
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
    `${ESC_DIM}Note : the copied .env files contain default test values for the${ESC_RESET}`,
  );
  console.log(
    `${ESC_DIM}local Supabase stack. Real production values stay out of the repo.${ESC_RESET}`,
  );
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
