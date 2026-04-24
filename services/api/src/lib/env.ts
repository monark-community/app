import { z } from "zod"

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
