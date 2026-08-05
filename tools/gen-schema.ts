// Assembles the Prisma schema from per-module fragments.
//
// `packages/db/prisma/schema.prisma` is a GENERATED, committed, drift-checked
// artifact — never hand-edited. Its sources are:
//   - packages/db/prisma/base.prisma           (datasource + generator + core)
//   - packages/<module>/prisma/*.prisma        (one fragment per extended module)
//
// Prisma, `pnpm install` (postinstall generate), and the testcontainer suite
// all read the committed schema.prisma unchanged ; only `pnpm gen:schema`
// rewrites it, so this rides the same codegen-drift protection as the
// DomainEvent union and the tRPC app router. Run via `pnpm gen` / `pnpm gen:schema`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolve the repo root from this file's location (tools/gen-schema.ts), so the
// assembler works no matter which package's script invokes it.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");
const BASE = join(PACKAGES, "db", "prisma", "base.prisma");
const OUT = join(PACKAGES, "db", "prisma", "schema.prisma");

const HEADER = `// ═══════════════════════════════════════════════════════════════
// GENERATED FILE — DO NOT EDIT.
// Assembled by \`pnpm gen:schema\` from packages/db/prisma/base.prisma plus each
// module's packages/<module>/prisma/*.prisma fragment. Edit those sources, then
// run \`pnpm gen\` (or \`pnpm gen:schema\`). CI fails on drift, like every other
// generated artifact.
// ═══════════════════════════════════════════════════════════════
`;

/** Every `packages/<module>/prisma/*.prisma` fragment, excluding @monark/db
 *  (which owns base.prisma + this generated output), sorted for determinism. */
function moduleFragments(): string[] {
  const files: string[] = [];
  for (const pkg of readdirSync(PACKAGES)) {
    if (pkg === "db") continue;
    const dir = join(PACKAGES, pkg, "prisma");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".prisma")) files.push(join(dir, f));
    }
  }
  return files.sort();
}

const stripTrailing = (s: string) => s.replace(/\n+$/, "");

const base = stripTrailing(readFileSync(BASE, "utf8"));
const fragmentPaths = moduleFragments();
const fragments = fragmentPaths.map((f) => stripTrailing(readFileSync(f, "utf8")));

const assembled = `${HEADER}\n${[base, ...fragments].join("\n\n")}\n`;
const rel = fragmentPaths.map((f) => f.replace(ROOT, "").replace(/\\/g, "/").replace(/^\//, ""));

// `--check` : verify the committed schema.prisma matches what the sources
// assemble to, without rewriting it. This is the CI drift guard the header
// promises — it rides next to `gen:events --check` / `gen:routers --check` in
// the repo-checks job. Fails if base/a fragment was edited without re-running
// `pnpm gen:schema`.
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  // Compare EOL-insensitively : the committed file may carry CRLF from a Windows
  // checkout while CI assembles with LF (the repo has no .gitattributes
  // normalization), and an EOL-only difference is not real codegen drift.
  const eol = (s: string) => s.replace(/\r/g, "");
  if (eol(current) !== eol(assembled)) {
    console.error(
      "gen:schema — DRIFT: packages/db/prisma/schema.prisma is out of date with base.prisma + the module fragments.\n" +
        "  Run `pnpm gen:schema` (or `pnpm gen`) and commit the result.",
    );
    process.exit(1);
  }
  console.log(`gen:schema — check OK (base + ${fragments.length} fragment(s) match schema.prisma)`);
} else {
  writeFileSync(OUT, assembled);
  console.log(
    `gen:schema — assembled base + ${fragments.length} fragment(s): ${rel.join(", ") || "(none)"}`,
  );
}
