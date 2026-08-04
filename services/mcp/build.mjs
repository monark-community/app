import { build } from "esbuild";

// Bundle the server into a single self-contained ESM binary for distribution
// (`npx @monark/mcp` once published, or `node dist/index.js`). Our own source is
// bundled ; runtime deps (@modelcontextprotocol/sdk, zod) stay external and are
// installed by npm from `dependencies`. The shebang makes the output directly
// executable as the package's `bin`.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
