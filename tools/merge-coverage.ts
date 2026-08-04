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
  // Re-baselined 2026-08-02 off a RELIABLE merged run (all 15 integration tasks
  // green, serialized `--concurrency=1`, plus two latent missing workspace-dep
  // declarations fixed — calendar→users, data-models→feature-flags — that a
  // clean isolated install had started failing on). Each floor sits ~5pts below
  // the measured number (rounded down to 5 %) — a regression guard, not a brag.
  // Ratcheted up where new tests justify it (calendar/organizations/auth via the
  // coverage-hardening pass); corrected down where the 2026-08-01 baseline was
  // depressed by the flaky run and over-set (common/data-models functions).
  // `service/api` genuinely dropped: the new `public-api` surface (auth/rate-limit
  // /mount) landed thin, so its floor reflects the honest post-public-api number
  // until that code is tested. Every package that emits coverage MUST have an
  // entry here (the gate below fails otherwise), so a new module can't ship
  // un-gated — hence `package/api-keys`, the newest module, is now floored.
  // api-keys + automation caught back up 2026-08-03 : the coverage-hardening
  // pass added the personal-key + service-account-key router branches
  // (api-keys 61 %→72 % branches, 80 %→93 % functions) and the node executors +
  // boot registrations (automation 68 %→81 % functions), so both floors ratchet
  // up well past where the in-flight feature work had dragged them.
  "package/api-keys": { lines: 80, statements: 80, functions: 85, branches: 65 },
  "package/auth": { lines: 60, statements: 60, functions: 75, branches: 80 },
  "package/automation": { lines: 75, statements: 75, functions: 75, branches: 70 },
  "package/calendar": { lines: 80, statements: 80, functions: 85, branches: 75 },
  "package/common": { lines: 70, statements: 70, functions: 70, branches: 80 },
  "package/data-models": { lines: 60, statements: 60, functions: 60, branches: 70 },
  "package/feature-flags": { lines: 80, statements: 80, functions: 75, branches: 85 },
  "package/files": { lines: 60, statements: 60, functions: 60, branches: 80 },
  // kanban : the query-compiler unit suite (every field × operator × error
  // branch of compileKanbanFilter) took branches 65 %→97 %, recovering the dip
  // the in-flight board work had caused and then some.
  "package/kanban": { lines: 80, statements: 80, functions: 70, branches: 90 },
  "package/notifications": { lines: 65, statements: 65, functions: 85, branches: 80 },
  "package/organizations": { lines: 75, statements: 75, functions: 85, branches: 85 },
  // Pure lib (AST + DSL + @variables + autocomplete engine), measured ~93 %
  // lines / 84 % branches / 100 % funcs — floors ~5pts below.
  "package/query": { lines: 88, statements: 88, functions: 90, branches: 78 },
  "package/rbac": { lines: 80, statements: 80, functions: 70, branches: 90 },
  "package/secrets": { lines: 90, statements: 90, functions: 75, branches: 85 },
  "package/users": { lines: 65, statements: 65, functions: 80, branches: 85 },
  "package/webhooks": { lines: 85, statements: 85, functions: 80, branches: 80 },
  // Ratcheted up 2026-08-03 : the public-api service now has an integration
  // suite (public-api.test.ts), so api jumped 57 % → 75 % lines / 41 % → 79 %
  // functions once those procedures are exercised.
  "service/api": { lines: 70, statements: 70, functions: 70, branches: 55 },
  "service/web": { lines: 5, statements: 5, functions: 40, branches: 80 },
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
    // A package that produced coverage but has no floor is a gap, not a pass —
    // that silent skip is how newly-added modules drifted un-gated. Fail so a
    // floor (or a conscious exclusion) is always added with the tests.
    if (!floor) {
      violations.push(`  ${label} produced coverage but has no THRESHOLDS entry — add a floor.`);
      continue;
    }
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
