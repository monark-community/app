import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODULES } from "../modules.manifest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

type ModuleTier = "core" | "extended";
type Violation = { module: string; dep: string; reason: string };

const tierOf = (pkg: string): ModuleTier | undefined =>
  (MODULES as Record<string, { tier: ModuleTier }>)[pkg]?.tier;

const packageDir = (modulePackageName: string): string =>
  resolve(APP_ROOT, "packages", modulePackageName.replace(/^@monark\//, ""));

async function readPackageJson(
  modulePackageName: string,
): Promise<{ dependencies?: Record<string, string> } | null> {
  try {
    const raw = await readFile(join(packageDir(modulePackageName), "package.json"), "utf8");
    return JSON.parse(raw) as { dependencies?: Record<string, string> };
  } catch {
    return null;
  }
}

/** Every `@monark/<pkg>` referenced from an import/require in a source file. */
const IMPORT_RE = /(?:from|import|require\()\s*["']@monark\/([a-z][a-z0-9-]*)(?:\/[^"']*)?["']/g;

// The core base Prisma schema. Extended modules must define their models in
// their OWN fragment (packages/<module>/prisma/*.prisma), never here — so a
// `── MODULE: <name> ──` banner for an extended module in base.prisma is a
// tier violation. (schema.prisma itself is generated from base + fragments by
// `pnpm gen:schema`, so it isn't scanned.)
const BASE_SCHEMA = resolve(APP_ROOT, "packages", "db", "prisma", "base.prisma");
const BANNER_RE = /MODULE:\s*([a-z][a-z0-9-]*)/g;

async function bannersInBaseSchema(): Promise<string[]> {
  try {
    const raw = await readFile(BASE_SCHEMA, "utf8");
    return [...raw.matchAll(BANNER_RE)]
      .map((m) => m[1])
      .filter((name): name is string => name != null);
  } catch {
    return [];
  }
}

/** Walk a module's `src/` and collect the extended-module imports it makes. */
async function scanImports(
  modulePackageName: string,
): Promise<Array<{ dep: string; where: string }>> {
  const srcDir = join(packageDir(modulePackageName), "src");
  let files: string[];
  try {
    files = (await readdir(srcDir, { recursive: true })).filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
    );
  } catch {
    return [];
  }
  const hits: Array<{ dep: string; where: string }> = [];
  for (const rel of files) {
    const content = await readFile(join(srcDir, rel), "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(IMPORT_RE)) {
        const dep = `@monark/${m[1]}`;
        if (dep !== modulePackageName && tierOf(dep) === "extended") {
          hits.push({ dep, where: `src/${rel.replace(/\\/g, "/")}:${i + 1}` });
        }
      }
    });
  }
  return hits;
}

async function main() {
  const violations: Violation[] = [];
  const moduleEntries = Object.entries(MODULES) as Array<[string, { tier: ModuleTier }]>;

  for (const [moduleName, meta] of moduleEntries) {
    if (meta.tier !== "extended") continue;

    // 1) Declared dependencies (catches a coupling wired in package.json even if
    // not yet imported).
    const pkg = await readPackageJson(moduleName);
    if (!pkg) {
      violations.push({
        module: moduleName,
        dep: "(missing)",
        reason: `package.json not found for ${moduleName}`,
      });
    } else {
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        if (dep !== moduleName && tierOf(dep) === "extended") {
          violations.push({
            module: moduleName,
            dep,
            reason: "extended module declares a dependency on another extended module",
          });
        }
      }
    }

    // 2) Actual import statements (catches a coupling that bypasses package.json
    // — an undeclared, transitive, or hand-added import). The dependency check
    // above only sees `package.json`, so this closes that blind spot.
    for (const { dep, where } of await scanImports(moduleName)) {
      violations.push({
        module: moduleName,
        dep,
        reason: `extended module imports another extended module (${where})`,
      });
    }
  }

  // 3) Schema ownership : an extended module's models must live in its own
  // fragment, never in the core base.prisma.
  for (const name of await bannersInBaseSchema()) {
    const dep = `@monark/${name}`;
    if (tierOf(dep) === "extended") {
      violations.push({
        module: dep,
        dep: "packages/db/prisma/base.prisma",
        reason:
          "extended module defines models in the core base schema (move its banner + models to packages/<module>/prisma/<module>.prisma)",
      });
    }
  }

  if (violations.length === 0) {
    console.log(
      `check:tiers: ok (${moduleEntries.length} modules checked — deps + imports + schema ownership)`,
    );
    return;
  }

  console.error("check:tiers: FAIL");
  for (const v of violations) {
    console.error(`  ${v.module} -> ${v.dep}: ${v.reason}`);
  }
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
