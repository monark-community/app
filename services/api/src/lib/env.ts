import { z } from "zod";

/**
 * Treat an empty string as "unset".
 *
 * Node's `--env-file` parser strips an unquoted `#` as a comment marker,
 * so `INITIAL_ORG_PRIMARY_COLOR=#2563EB` (the shape a deployer copies out
 * of a design tool) resolves to `""` rather than the hex. Without this the
 * value reaches a `.regex()` that `.optional()` cannot excuse — `""` is a
 * present string — and the api hard-exits at boot on a variable it does
 * not actually need. Collapsing `""` to `undefined` keeps a mis-quoted
 * optional from taking the process down ; the operator gets the documented
 * fallback instead of a crash.
 */
function optionalNonEmpty<T extends z.ZodTypeAny>(inner: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), inner.optional());
}

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  // Comma-separated list; both localhost + 127.0.0.1 by default since
  // Supabase's email confirmation flow can land on either hostname.
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000")
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  // Canonical web origin used when we mint user-facing URLs (e.g. email links).
  APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  // 32 bytes, hex-encoded (64 chars). Validated lazily by the TOTP module
  // so environments without TOTP configured (e.g. CI) don't need to set it.
  TOTP_ENCRYPTION_KEY: z.string().optional(),
  // 32 bytes, hex-encoded (64 chars) — key for the org-secrets store
  // (`@monark/secrets`, encrypted external access tokens). Separate from
  // TOTP's key so their blast radius stays independent. Validated lazily
  // (fail-closed) when a secret is written/read, so deploys not using
  // secrets (e.g. CI) don't need it. Generate with
  // `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  SECRETS_ENCRYPTION_KEY: z.string().optional(),
  // HMAC secret for one-click email action tokens (currently only the
  // new-device "revoke this device" link). Generate per environment with
  // `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  // Optional here ; the token mint/verify helpers in `@monark/auth`
  // fall back to a fixed dev default with a `logger.warn` when unset
  // so local dev + CI work out of the box. Production deploys MUST set
  // a real value — otherwise an attacker who knows the dev default
  // can forge revoke tokens for any user.
  EMAIL_ACTION_SECRET: z.string().min(32).optional(),
  // Shared secret required to trigger any of the `/cron/*` endpoints. Optional
  // here ; the cron handlers refuse requests when it's unset so an
  // accidentally-empty secret can't be matched. Set in production.
  CRON_SECRET: z.string().optional(),
  // Public API (/api/v1) per-key rate limit : a token bucket refilling at
  // PUBLIC_API_RATE_PER_SECOND up to a ceiling of PUBLIC_API_BURST. Defaults
  // suit an interactive integration ; raise for higher-throughput deployments.
  PUBLIC_API_RATE_PER_SECOND: z.coerce.number().positive().default(5),
  PUBLIC_API_BURST: z.coerce.number().int().positive().default(20),
  // Singleton-org bootstrap : when zero organizations exist, the API
  // boot hook reads these and
  // creates the singleton org the rest of the app needs. Idempotent ;
  // a second restart on a healthy install is a no-op. The "external
  // tool / system" the user manages writes these into the deployment
  // environment.
  INITIAL_ORG_SLUG: optionalNonEmpty(
    z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "invalid INITIAL_ORG_SLUG"),
  ),
  INITIAL_ORG_NAME: optionalNonEmpty(z.string().trim().min(1).max(120)),
  INITIAL_ORG_PRIMARY_COLOR: optionalNonEmpty(
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        'invalid INITIAL_ORG_PRIMARY_COLOR (hex like "#2563EB" ; quote it in .env — an unquoted leading # is read as a comment)',
      ),
  ),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
