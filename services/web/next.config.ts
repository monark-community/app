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
    "@monark/users",
  ],
}

export default withNextIntl(config)
