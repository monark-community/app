import { readdir, readFile, mkdir, rm, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import libCoverage, { type CoverageMap, type FileCoverageData } from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

// Each package runs vitest twice — once for unit tests (coverage/unit/),
// once for integration tests (coverage/integration/) — and emits a
// `coverage-final.json` per run because of the `json` reporter in
// `vitest.shared.ts`. This script fuses the two into a single
// coverage/coverage-final.json + coverage/lcov.info per package so
// Codecov sees one merged report instead of two partial ones.
//
// We deliberately do NOT touch services/web : it has no integration
// suite today, but the unit reportsDirectory still goes to
// coverage/unit/ so this script will surface its unit-only numbers
// without special-casing.

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

// Per-package coverage floors. Each metric is set 5pts below the
// measured baseline from the first merged CI run (rounded down to
// the nearest 5%) so a regression breaks the build but the floor
// doesn't sit on the current number. Bump these whenever the actual
// coverage ratchets up — the floor is here to prevent regressions,
// not to brag about the absolute number.
//
// Packages without an integration suite (common, web) carry unit-
// only numbers ; the floor reflects that. Packages with an
// integration suite carry the fused unit+integration numbers because
// most data-layer code only runs under integration.
//
// Skipped packages (branding, components, db, shared, test-utils)
// have no test suites today ; add them here when they grow tests.
type Thresholds = { lines: number; statements: number; functions: number; branches: number };
const THRESHOLDS: Record<string, Thresholds> = {
  "package/auth": { lines: 60, statements: 60, functions: 75, branches: 85 },
  "package/common": { lines: 55, statements: 55, functions: 95, branches: 80 },
  "package/feature-flags": { lines: 80, statements: 80, functions: 75, branches: 85 },
  "package/notifications": { lines: 60, statements: 60, functions: 85, branches: 80 },
  "package/organizations": { lines: 50, statements: 50, functions: 70, branches: 80 },
  "package/rbac": { lines: 50, statements: 50, functions: 55, branches: 80 },
  "package/users": { lines: 75, statements: 75, functions: 85, branches: 85 },
  "package/webhooks": { lines: 55, statements: 55, functions: 60, branches: 80 },
  "service/api": { lines: 65, statements: 65, functions: 70, branches: 45 },
  "service/web": { lines: 5, statements: 5, functions: 60, branches: 80 },
};

type PackageDir = { kind: "package" | "service"; name: string; absPath: string };

async function listPackageDirs(): Promise<PackageDir[]> {
  const out: PackageDir[] = [];
  for (const kind of ["package", "service"] as const) {
    const parent = kind === "package" ? "packages" : "services";
    const parentAbs = resolve(APP_ROOT, parent);
    const entries = await readdir(parentAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      out.push({ kind, name: entry.name, absPath: resolve(parentAbs, entry.name) });
    }
  }
  return out;
}

async function readJsonIfExists(path: string): Promise<Record<string, FileCoverageData> | null> {
  try {
    await stat(path);
  } catch {
    return null;
  }
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Record<string, FileCoverageData>;
}

function summarisePercent(map: CoverageMap): {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
} {
  const summary = map.getCoverageSummary();
  return {
    lines: summary.lines.pct as number,
    statements: summary.statements.pct as number,
    functions: summary.functions.pct as number,
    branches: summary.branches.pct as number,
  };
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

function formatPct(pct: number): string {
  if (Number.isNaN(pct)) return "  n/a ";
  return `${pct.toFixed(2).padStart(6, " ")}%`;
}

async function mergeOne(
  pkg: PackageDir,
): Promise<{ pkg: PackageDir; merged: CoverageMap; sources: string[] } | null> {
  const unitPath = resolve(pkg.absPath, "coverage/unit/coverage-final.json");
  const integrationPath = resolve(pkg.absPath, "coverage/integration/coverage-final.json");

  const [unit, integration] = await Promise.all([
    readJsonIfExists(unitPath),
    readJsonIfExists(integrationPath),
  ]);

  if (!unit && !integration) return null;

  const map = libCoverage.createCoverageMap({});
  const sources: string[] = [];
  if (unit) {
    map.merge(unit);
    sources.push("unit");
  }
  if (integration) {
    map.merge(integration);
    sources.push("integration");
  }
  return { pkg, merged: map, sources };
}

async function writeMerged(pkg: PackageDir, map: CoverageMap): Promise<void> {
  const outDir = resolve(pkg.absPath, "coverage");
  await mkdir(outDir, { recursive: true });

  // Write the raw merged JSON next to the per-run subdirs so a future
  // tool can re-merge or diff it.
  const finalJsonPath = resolve(outDir, "coverage-final.json");
  await writeFile(finalJsonPath, JSON.stringify(map.toJSON()), "utf8");

  // Regenerate lcov.info from the merged map. This is what the
  // codecov action uploads — overwriting the unit-only lcov.info
  // that vitest dropped at coverage/lcov.info during the unit run is
  // exactly what we want.
  const context = libReport.createContext({
    dir: outDir,
    coverageMap: map,
    defaultSummarizer: "nested",
  });
  const lcovReport = reports.create("lcov", { projectRoot: pkg.absPath });
  // istanbul-reports' `Visitor` type isn't reachable from the public
  // entrypoints we use here ; the `execute` API accepts the context
  // produced by `libReport.createContext` directly.
  lcovReport.execute(context as unknown as Parameters<typeof lcovReport.execute>[0]);

  // Delete the per-run subdirs once the merged output is in place.
  // Codecov v4's auto-discovery walks every `coverage/` subdir and
  // would otherwise upload `coverage/{unit,integration}/lcov.info`
  // alongside the merged `coverage/lcov.info`, leading to three
  // conflicting reports per package on the dashboard. Removing them
  // here is belt-and-suspenders even with `disable_search: true` on
  // the action — if a future workflow change re-enables search, the
  // upload still stays clean.
  for (const subdir of ["unit", "integration"]) {
    await rm(resolve(outDir, subdir), { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const dirs = await listPackageDirs();
  const results: Array<{ pkg: PackageDir; merged: CoverageMap; sources: string[] }> = [];
  const skipped: PackageDir[] = [];

  for (const pkg of dirs) {
    const result = await mergeOne(pkg);
    if (!result) {
      skipped.push(pkg);
      continue;
    }
    await writeMerged(result.pkg, result.merged);
    results.push(result);
  }

  if (results.length === 0) {
    console.error(
      "merge-coverage: no coverage-final.json files found ; run `pnpm test:coverage` and `pnpm test:integration:coverage` first.",
    );
    process.exit(1);
  }

  const labelWidth = Math.max(...results.map((r) => `${r.pkg.kind}/${r.pkg.name}`.length)) + 2;
  console.log("");
  console.log(`merge-coverage : ${results.length} package(s) merged`);
  console.log("");
  console.log(
    `  ${pad("package", labelWidth)}  ${pad("sources", 22)}  ${pad("lines", 8)}  ${pad("stmts", 8)}  ${pad("funcs", 8)}  ${pad("branch", 8)}`,
  );
  console.log(
    `  ${pad("-------", labelWidth)}  ${pad("-------", 22)}  ${pad("-----", 8)}  ${pad("-----", 8)}  ${pad("-----", 8)}  ${pad("------", 8)}`,
  );
  for (const r of results) {
    const summary = summarisePercent(r.merged);
    const label = `${r.pkg.kind}/${r.pkg.name}`;
    const sourcesLabel = r.sources.join("+");
    console.log(
      `  ${pad(label, labelWidth)}  ${pad(sourcesLabel, 22)}  ${formatPct(summary.lines)}  ${formatPct(summary.statements)}  ${formatPct(summary.functions)}  ${formatPct(summary.branches)}`,
    );
  }

  if (skipped.length > 0) {
    console.log("");
    console.log(
      `  skipped (no coverage runs found) : ${skipped.map((p) => `${p.kind}/${p.name}`).join(", ")}`,
    );
  }

  // Threshold gate. After-merge so the data-layer files (mostly
  // covered under integration only) count toward the floor even
  // though they show 0 % in the unit-only run. Any package below its
  // floor on any metric blocks the merge step ; CI fails before the
  // Codecov upload so the merged lcov never sits in object storage
  // claiming a number that doesn't pass.
  const violations: string[] = [];
  for (const r of results) {
    const label = `${r.pkg.kind}/${r.pkg.name}`;
    const floor = THRESHOLDS[label];
    if (!floor) continue;
    const summary = summarisePercent(r.merged);
    const checks: Array<[keyof Thresholds, number]> = [
      ["lines", summary.lines],
      ["statements", summary.statements],
      ["functions", summary.functions],
      ["branches", summary.branches],
    ];
    for (const [metric, actual] of checks) {
      const required = floor[metric];
      if (actual < required) {
        violations.push(`  ${label} ${metric} = ${actual.toFixed(2)} % < ${required} % floor`);
      }
    }
  }

  if (violations.length > 0) {
    console.log("");
    console.log("merge-coverage : threshold violations");
    for (const v of violations) console.log(v);
    console.log("");
    console.log(
      "  Either add tests until each metric clears its floor, or update THRESHOLDS in tools/merge-coverage.ts after deciding the floor should drop.",
    );
    process.exit(1);
  }

  console.log("");
  console.log("merge-coverage : every measured package clears its threshold floor");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
