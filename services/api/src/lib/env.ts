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
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
