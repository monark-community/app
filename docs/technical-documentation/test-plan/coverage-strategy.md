# Coverage strategy

### Per-package thresholds

Each package's `vitest.config.ts` sets :

```ts
test: {
  coverage: {
    provider: "v8",
    reporter: ["text", "lcov"],
    thresholds: {
      lines: 75,
      branches: 75,
      functions: 75,
      statements: 75,
    },
    exclude: [
      "**/index.ts",        // re-exports only
      "**/*.d.ts",
      "**/contracts/**",    // type-only modules
      "**/types.ts",
      "src/server/data/generated/**", // codegen
    ],
  },
}
```

Special-case overrides :

- `@monark/db` ; 50 % overall (most code is generated).
- `services/api` ; 70 % overall (a lot of the surface is Express plumbing).
- `services/web/src/app/(authed)/**/actions.ts` ; 80 % (security-sensitive).

### Aggregated coverage

The CI job uploads each package's `coverage/lcov.info` to [Codecov](https://about.codecov.io/) (or stores it as a build artifact). The repo's coverage badge points at the aggregated number. Phase-2 work should lift the floor over time ; the per-package threshold is the load-bearing gate.

### Local dev

`pnpm test --coverage` from any package prints the threshold report to the terminal. Devs see "lines coverage 73.4 % / threshold 75 %" before pushing ; same gate CI uses.
