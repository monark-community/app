import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@monark/auth",
    "@monark/common",
    "@monark/components",
    "@monark/feature-flags",
    "@monark/notifications",
    "@monark/users",
  ],
  // Pino + its transports load worker scripts via `require.resolve` at
  // runtime, which Next's bundler can't statically analyse. Marking them
  // external keeps them on Node's normal require chain so the pretty
  // transport (used only in dev, only when stdout is a TTY) initialises
  // correctly without webpack trying to bundle the worker entry.
  serverExternalPackages: ["pino", "pino-pretty"],
}

export default withNextIntl(config)
