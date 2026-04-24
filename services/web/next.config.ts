import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@monark/components", "@monark/common"],
}

export default config
