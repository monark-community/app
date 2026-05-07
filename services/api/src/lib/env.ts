import { z } from "zod"

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  // Comma-separated list; both localhost + 127.0.0.1 by default since
  // Supabase's email confirmation flow can land on either hostname.
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000")
    .transform((raw) => raw.split(",").map((s) => s.trim()).filter(Boolean)),
  // Canonical web origin used when we mint user-facing URLs (e.g. email links).
  APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  // 32 bytes, hex-encoded (64 chars). Validated lazily by the TOTP module
  // so environments without TOTP configured (e.g. CI) don't need to set it.
  TOTP_ENCRYPTION_KEY: z.string().optional(),
  // Shared secret required to trigger any of the `/cron/*` endpoints. Optional
  // here ; the cron handlers refuse requests when it's unset so an
  // accidentally-empty secret can't be matched. Set in production.
  CRON_SECRET: z.string().optional(),
  // Single-tenant bootstrap : when the `tenancy.multi-tenant` flag is OFF
  // and zero organizations exist, the API boot hook reads these and
  // creates the singleton org so the /setup gate can lift. Idempotent ;
  // a second restart on a healthy install is a no-op. The "external
  // tool / system" the user manages writes these into the deployment
  // environment.
  INITIAL_ORG_SLUG: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "invalid INITIAL_ORG_SLUG")
    .optional(),
  INITIAL_ORG_NAME: z.string().trim().min(1).max(120).optional(),
  INITIAL_ORG_PRIMARY_COLOR: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "invalid INITIAL_ORG_PRIMARY_COLOR")
    .optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
