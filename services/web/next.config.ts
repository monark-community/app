import type { NextConfig } from "next"

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

export default config
