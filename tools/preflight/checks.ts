import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveValue, isSwallowedByComment, readEnvFile, type EnvFile } from "./env-file";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(__dirname, "..", "..");

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckResult = {
  id: string;
  title: string;
  status: CheckStatus;
  /** What preflight actually found. Present tense, no blame. */
  detail: string;
  /** The next action, concrete enough to paste. Omitted when passing. */
  fix?: string;
};

export type CheckGroup = {
  id: string;
  title: string;
  results: CheckResult[];
};

export type PreflightOptions = {
  /** Skip checks that open a socket. For CI, or a machine that's offline. */
  skipNetwork?: boolean;
};

export type PreflightReport = {
  groups: CheckGroup[];
  /** True when nothing is `fail` : the app is safe to start. */
  ok: boolean;
  failures: number;
  warnings: number;
  ranAt: Date;
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;

function pass(id: string, title: string, detail: string): CheckResult {
  return { id, title, status: "pass", detail };
}
function warn(id: string, title: string, detail: string, fix: string): CheckResult {
  return { id, title, status: "warn", detail, fix };
}
function fail(id: string, title: string, detail: string, fix: string): CheckResult {
  return { id, title, status: "fail", detail, fix };
}

/**
 * One required-variable check, with the quoting trap called out
 * separately from plain absence. Those two look identical from
 * `process.env` and need completely different fixes, which is the whole
 * reason this tool reads the files itself rather than trusting the
 * loaded environment.
 */
function requiredVar(
  file: EnvFile,
  key: string,
  opts: { title: string; fix: string; validate?: (value: string) => string | null } = {
    title: key,
    fix: `Set ${key} in ${file.path}.`,
  },
): CheckResult {
  const entry = file.entries.get(key);
  const value = effectiveValue(file, key);

  if (isSwallowedByComment(entry)) {
    return fail(
      key,
      opts.title,
      `${key} is set on line ${entry?.line} but parses as empty : the value starts with an unquoted "#", which the env parser reads as a comment.`,
      `Quote it — ${key}="${entry?.rawValue.trim()}"`,
    );
  }
  if (value === "") {
    return fail(key, opts.title, `${key} is not set.`, opts.fix);
  }
  const problem = opts.validate?.(value);
  if (problem) return fail(key, opts.title, problem, opts.fix);
  return pass(key, opts.title, "set");
}

/** Same, but a missing value is a warning rather than a hard stop. */
function optionalVar(
  file: EnvFile,
  key: string,
  opts: {
    title: string;
    whenMissing: string;
    fix: string;
    validate?: (v: string) => string | null;
  },
): CheckResult {
  const entry = file.entries.get(key);
  const value = effectiveValue(file, key);

  if (isSwallowedByComment(entry)) {
    return fail(
      key,
      opts.title,
      `${key} is set on line ${entry?.line} but parses as empty : the value starts with an unquoted "#", read as a comment.`,
      `Quote it — ${key}="${entry?.rawValue.trim()}"`,
    );
  }
  if (value === "") return warn(key, opts.title, opts.whenMissing, opts.fix);
  const problem = opts.validate?.(value);
  if (problem) return fail(key, opts.title, problem, opts.fix);
  return pass(key, opts.title, value);
}

function validHex(label: string) {
  return (value: string): string | null =>
    HEX_RE.test(value) ? null : `${label} is "${value}", which is not a #RGB / #RRGGBB hex colour.`;
}

function validUrl(label: string) {
  return (value: string): string | null => {
    try {
      new URL(value);
      return null;
    } catch {
      return `${label} is "${value}", which is not a parseable URL.`;
    }
  };
}

/** Can we open a TCP connection to host:port within `timeoutMs`? */
function probeTcp(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect({ host, port });
    const done = (result: boolean) => {
      socket.destroy();
      resolvePromise(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function hostPortFromUrl(raw: string, defaultPort: number): { host: string; port: number } | null {
  try {
    const url = new URL(raw);
    const port = url.port === "" ? defaultPort : Number(url.port);
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}

/**
 * Postgres connection strings are URLs, but `postgresql://` has no
 * default port in the URL spec, so the port has to be defaulted here.
 */
function postgresTarget(raw: string) {
  return hostPortFromUrl(raw, 5432);
}

// ── groups ───────────────────────────────────────────────────────────

async function checkRuntime(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  results.push(
    Number.isNaN(major) || major < 22
      ? fail(
          "node-version",
          "Node 22+",
          `Running Node ${process.versions.node}.`,
          "Install Node 22 (see .nvmrc) with nvm / fnm / volta.",
        )
      : pass("node-version", "Node 22+", `Node ${process.versions.node}`),
  );
  return { id: "runtime", title: "Runtime", results };
}

function checkApiEnv(api: EnvFile, db: EnvFile): CheckGroup {
  const results: CheckResult[] = [];

  if (!api.exists) {
    results.push(
      fail(
        "api-env-file",
        "services/api/.env",
        "The file does not exist.",
        "Run `pnpm bootstrap`, or copy services/api/.env.example to services/api/.env.",
      ),
    );
  }
  if (!db.exists) {
    results.push(
      fail(
        "db-env-file",
        "packages/db/.env",
        "The file does not exist. The Prisma CLI reads env from the schema's own package, so it needs its own copy.",
        "Run `pnpm bootstrap`, or copy packages/db/.env.example to packages/db/.env.",
      ),
    );
  }

  results.push(
    requiredVar(db, "DATABASE_URL", {
      title: "Database URL (Prisma CLI)",
      fix: "Set DATABASE_URL in packages/db/.env — `pnpm exec supabase status -o env` prints DB_URL for the local stack.",
      validate: validUrl("DATABASE_URL"),
    }),
    requiredVar(db, "DIRECT_URL", {
      title: "Direct database URL",
      fix: "Set DIRECT_URL in packages/db/.env to the same value as DATABASE_URL for a non-pooled deployment.",
      validate: validUrl("DIRECT_URL"),
    }),
    requiredVar(api, "SUPABASE_URL", {
      title: "Supabase URL",
      fix: "Set SUPABASE_URL in services/api/.env — `pnpm exec supabase status -o env` prints API_URL.",
      validate: validUrl("SUPABASE_URL"),
    }),
    requiredVar(api, "SUPABASE_PUBLISHABLE_KEY", {
      title: "Supabase publishable key",
      fix: "Set SUPABASE_PUBLISHABLE_KEY in services/api/.env (PUBLISHABLE_KEY from `supabase status -o env`).",
    }),
    requiredVar(api, "SUPABASE_SECRET_KEY", {
      title: "Supabase secret key",
      fix: "Set SUPABASE_SECRET_KEY in services/api/.env (SECRET_KEY from `supabase status -o env`). Never expose this to the browser.",
    }),
  );

  // At-rest keys. Wrong length is worth its own message : a truncated
  // paste is a common failure and the error it eventually causes
  // (decrypt failure on an existing row) points nowhere near the env.
  for (const [key, title] of [
    ["TOTP_ENCRYPTION_KEY", "TOTP encryption key"],
    ["SECRETS_ENCRYPTION_KEY", "Org-secrets encryption key"],
    ["CRON_SECRET", "Cron shared secret"],
  ] as const) {
    results.push(
      requiredVar(api, key, {
        title,
        fix: `Generate one : node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))" and set ${key} in services/api/.env.`,
        validate: (value) =>
          key === "CRON_SECRET" || HEX_KEY_RE.test(value)
            ? null
            : `${key} is ${value.length} characters ; it must be 32 bytes hex-encoded (64 characters).`,
      }),
    );
  }

  results.push(
    requiredVar(api, "WEB_ORIGIN", {
      title: "Web origin (CORS + cookies)",
      fix: "Set WEB_ORIGIN in services/api/.env to the browser-facing origin of the web app.",
    }),
    requiredVar(api, "APP_URL", {
      title: "App URL (email links)",
      fix: "Set APP_URL in services/api/.env to the public URL of the web app.",
      validate: validUrl("APP_URL"),
    }),
  );

  return { id: "api-env", title: "API environment", results };
}

function checkWebEnv(web: EnvFile): CheckGroup {
  const results: CheckResult[] = [];
  if (!web.exists) {
    results.push(
      fail(
        "web-env-file",
        "services/web/.env",
        "The file does not exist.",
        "Run `pnpm bootstrap`, or copy services/web/.env.example to services/web/.env.",
      ),
    );
  }
  results.push(
    requiredVar(web, "NEXT_PUBLIC_SUPABASE_URL", {
      title: "Supabase URL (browser)",
      fix: "Set NEXT_PUBLIC_SUPABASE_URL in services/web/.env. Next inlines NEXT_PUBLIC_* at build time, so it must be set before `next build`.",
      validate: validUrl("NEXT_PUBLIC_SUPABASE_URL"),
    }),
    requiredVar(web, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", {
      title: "Supabase publishable key (browser)",
      fix: "Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in services/web/.env.",
    }),
    requiredVar(web, "NEXT_PUBLIC_API_URL", {
      title: "API URL (browser)",
      fix: "Set NEXT_PUBLIC_API_URL in services/web/.env to the browser-facing origin of the api.",
      validate: validUrl("NEXT_PUBLIC_API_URL"),
    }),
    requiredVar(web, "SUPABASE_SECRET_KEY", {
      title: "Supabase secret key (web server actions)",
      fix: "Set SUPABASE_SECRET_KEY in services/web/.env — server-only, never the NEXT_PUBLIC_ form.",
    }),
  );

  // Catching the leak is worth a hard failure : a secret key inlined
  // into the client bundle is shipped to every visitor and can't be
  // recalled once built.
  const leaked = web.entries.get("NEXT_PUBLIC_SUPABASE_SECRET_KEY");
  if (leaked && leaked.value !== "") {
    results.push(
      fail(
        "secret-key-leak",
        "Secret key is not browser-exposed",
        `NEXT_PUBLIC_SUPABASE_SECRET_KEY is set on line ${leaked.line}. Next inlines every NEXT_PUBLIC_* variable into the client bundle, so this ships the service-role key to every visitor.`,
        "Remove NEXT_PUBLIC_SUPABASE_SECRET_KEY and rotate the key in the Supabase dashboard.",
      ),
    );
  } else {
    results.push(
      pass("secret-key-leak", "Secret key is not browser-exposed", "no NEXT_PUBLIC_ secret key"),
    );
  }

  return { id: "web-env", title: "Web environment", results };
}

function checkBranding(api: EnvFile, web: EnvFile): CheckGroup {
  const results: CheckResult[] = [];

  results.push(
    optionalVar(api, "BRANDING_APP_NAME", {
      title: "Product name",
      whenMissing: 'BRANDING_APP_NAME is unset, so the app calls itself "App".',
      fix: "Set BRANDING_APP_NAME in services/api/.env and NEXT_PUBLIC_BRANDING_APP_NAME in services/web/.env. See docs/technical-documentation/white-label.md.",
    }),
    optionalVar(api, "BRANDING_PRIMARY", {
      title: "Brand colour",
      whenMissing: "BRANDING_PRIMARY is unset, so the UI uses the neutral starter colour.",
      fix: 'Set BRANDING_PRIMARY="#RRGGBB" (quoted) in services/api/.env, mirrored as NEXT_PUBLIC_BRANDING_PRIMARY in services/web/.env.',
      validate: validHex("BRANDING_PRIMARY"),
    }),
    optionalVar(api, "INITIAL_ORG_PRIMARY_COLOR", {
      title: "Organization colour",
      whenMissing:
        "INITIAL_ORG_PRIMARY_COLOR is unset. The org keeps whatever colour it was provisioned with, or falls back to BRANDING_PRIMARY.",
      fix: 'Set INITIAL_ORG_PRIMARY_COLOR="#RRGGBB" (quoted) in services/api/.env.',
      validate: validHex("INITIAL_ORG_PRIMARY_COLOR"),
    }),
  );

  // The NEXT_PUBLIC_ mirror is easy to forget and fails asymmetrically :
  // emails and the TOTP issuer get the brand, the browser doesn't.
  const serverName = effectiveValue(api, "BRANDING_APP_NAME");
  const browserName = effectiveValue(web, "NEXT_PUBLIC_BRANDING_APP_NAME");
  if (serverName !== "" && browserName === "") {
    results.push(
      warn(
        "branding-mirror",
        "Browser branding mirrors the server",
        `BRANDING_APP_NAME is "${serverName}" but NEXT_PUBLIC_BRANDING_APP_NAME is unset, so page titles and the app-bar wordmark still say "App".`,
        `Set NEXT_PUBLIC_BRANDING_APP_NAME="${serverName}" in services/web/.env.`,
      ),
    );
  } else if (serverName !== "" && browserName !== serverName) {
    results.push(
      warn(
        "branding-mirror",
        "Browser branding mirrors the server",
        `BRANDING_APP_NAME is "${serverName}" but NEXT_PUBLIC_BRANDING_APP_NAME is "${browserName}".`,
        "Set both to the same value ; they name the same product on two runtimes.",
      ),
    );
  } else {
    results.push(pass("branding-mirror", "Browser branding mirrors the server", "in sync"));
  }

  return { id: "branding", title: "Branding", results };
}

function checkAssets(api: EnvFile, web: EnvFile): CheckGroup {
  const results: CheckResult[] = [];
  const publicDir = resolve(APP_ROOT, "services", "web", "public");

  // A configured logo path that doesn't resolve is a broken image on the
  // sign-in page, which is the first thing anyone sees.
  const logoSrc =
    effectiveValue(api, "BRANDING_LOGO_SRC") ||
    effectiveValue(web, "NEXT_PUBLIC_BRANDING_LOGO_SRC");
  if (logoSrc === "") {
    results.push(
      warn(
        "logo-file",
        "Brand logo",
        "BRANDING_LOGO_SRC is unset, so pre-auth screens fall back to the neutral placeholder logo.",
        "Drop a file in services/web/public/ and point BRANDING_LOGO_SRC at it (e.g. /logo.svg).",
      ),
    );
  } else {
    const target = resolve(publicDir, logoSrc.replace(/^\//, ""));
    results.push(
      existsSync(target)
        ? pass("logo-file", "Brand logo", logoSrc)
        : fail(
            "logo-file",
            "Brand logo",
            `BRANDING_LOGO_SRC points at "${logoSrc}", but services/web/public${logoSrc} does not exist.`,
            `Add the file, or correct BRANDING_LOGO_SRC. Paths are served from services/web/public/ and must start with "/".`,
          ),
    );
  }

  const favicon = resolve(APP_ROOT, "services", "web", "src", "app", "favicon.ico");
  results.push(
    existsSync(favicon)
      ? pass("favicon", "Favicon", "present")
      : fail(
          "favicon",
          "Favicon",
          "services/web/src/app/favicon.ico is missing ; the browser tab will fall back to a blank icon.",
          "Add a favicon.ico at services/web/src/app/favicon.ico. No env var covers this — Next serves the file as-is.",
        ),
  );

  return { id: "assets", title: "Assets", results };
}

async function checkConnectivity(api: EnvFile, db: EnvFile): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  const dbUrl = effectiveValue(db, "DATABASE_URL") || effectiveValue(api, "DATABASE_URL");
  const target = dbUrl === "" ? null : postgresTarget(dbUrl);
  if (!target) {
    results.push(
      warn(
        "db-reachable",
        "Database reachable",
        "Skipped : no usable DATABASE_URL to probe.",
        "Fix DATABASE_URL first ; this check will then verify the database answers.",
      ),
    );
  } else {
    const reachable = await probeTcp(target.host, target.port);
    results.push(
      reachable
        ? pass("db-reachable", "Database reachable", `${target.host}:${target.port}`)
        : fail(
            "db-reachable",
            "Database reachable",
            `Nothing is accepting connections at ${target.host}:${target.port}.`,
            "Start the database — locally that's `pnpm exec supabase start`. In a deploy, check the host, port and network rules.",
          ),
    );
  }

  const supabaseUrl = effectiveValue(api, "SUPABASE_URL");
  const supabaseTarget = supabaseUrl === "" ? null : hostPortFromUrl(supabaseUrl, 443);
  if (!supabaseTarget) {
    results.push(
      warn(
        "supabase-reachable",
        "Supabase reachable",
        "Skipped : no usable SUPABASE_URL to probe.",
        "Fix SUPABASE_URL first.",
      ),
    );
  } else {
    const reachable = await probeTcp(supabaseTarget.host, supabaseTarget.port);
    results.push(
      reachable
        ? pass(
            "supabase-reachable",
            "Supabase reachable",
            `${supabaseTarget.host}:${supabaseTarget.port}`,
          )
        : fail(
            "supabase-reachable",
            "Supabase reachable",
            `Nothing is accepting connections at ${supabaseTarget.host}:${supabaseTarget.port}.`,
            "Start the local stack with `pnpm exec supabase start`, or check the project URL for a hosted deployment.",
          ),
    );
  }

  return { id: "connectivity", title: "Connectivity", results };
}

/**
 * Run every check and fold the results into one report.
 *
 * Deliberately never throws : this runs in front of the app, and a
 * preflight tool that crashes is strictly worse than one that reports
 * "unknown". Every individual check is responsible for turning its own
 * failure into a result.
 */
export async function runPreflight(options: PreflightOptions = {}): Promise<PreflightReport> {
  const api = readEnvFile(resolve(APP_ROOT, "services", "api", ".env"));
  const web = readEnvFile(resolve(APP_ROOT, "services", "web", ".env"));
  const db = readEnvFile(resolve(APP_ROOT, "packages", "db", ".env"));

  const groups: CheckGroup[] = [
    await checkRuntime(),
    checkApiEnv(api, db),
    checkWebEnv(web),
    checkBranding(api, web),
    checkAssets(api, web),
  ];

  if (options.skipNetwork) {
    groups.push({
      id: "connectivity",
      title: "Connectivity",
      results: [
        warn(
          "network-skipped",
          "Connectivity",
          "Skipped (--skip-network).",
          "Re-run without --skip-network to verify the database and Supabase answer.",
        ),
      ],
    });
  } else {
    groups.push(await checkConnectivity(api, db));
  }

  const all = groups.flatMap((group) => group.results);
  const failures = all.filter((r) => r.status === "fail").length;
  const warnings = all.filter((r) => r.status === "warn").length;

  return { groups, ok: failures === 0, failures, warnings, ranAt: new Date() };
}
