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
  LOG_LEVEL: z.string().default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
