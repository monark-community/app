import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        include: ["src/**/*.ts"],
      },
    },
  }),
)
