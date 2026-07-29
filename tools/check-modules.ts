import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MODULES } from "../modules.manifest";
import { moduleRouterName, packageDirName } from "./lib/names";

// Module-completeness gate. Enforces the structural invariants a module is
// supposed to satisfy so the "can a feature ship without touching core?"
// contract stays honest and the two-tier governance can't leak (the calendar
// module once had a tRPC router wired into the API but was missing from the
// manifest, so `pnpm gen` would have deleted it and CI drift-checks failed).
//
// Checks (all ERRORS unless acknowledged below):
//   1. router-in-manifest : any package whose src/server/index.ts exports a
//      `<name>Router` MUST appear in modules.manifest.ts (else codegen drifts).
//   2. package-name        : each manifest module's package.json name matches.
//   3. readme              : each manifest module ships a README.md.
//   4. events              : a module with a tRPC router ships contracts/events.ts
//      (so its domain events join the DomainEvent union + the webhooks picker).
//   5. integration-tests   : a module with a tRPC router ships tests/integration/.
//
// Current, consciously-accepted gaps are listed in ACKNOWLEDGED_GAPS so the
// gate is green today while the debt stays visible in code. A gap that is
// actually resolved but still listed fails the gate, so the list self-cleans.

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

// Format: "<module-name>:<check>", where <check> is one of "events" or
// "integration-tests". Each entry is debt we've chosen to carry ; remove it
// the moment the underlying gap is fixed (the gate will tell you to).
const ACKNOWLEDGED_GAPS = new Set<string>([]);

type Severity = "error" | "notice";
type Finding = { module: string; check: string; message: string; severity: Severity };

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageName(dir: string): Promise<string | null> {
  try {
    const raw = await readFile(resolve(APP_ROOT, "packages", dir, "package.json"), "utf8");
    return (JSON.parse(raw) as { name?: string }).name ?? null;
  } catch {
    return null;
  }
}

// A package "has a router" if its server entry exports the conventional
// `<name>Router` binding — the exact signal gen-routers keys on.
async function hasRouter(moduleName: string): Promise<boolean> {
  const p = resolve(APP_ROOT, "packages", packageDirName(moduleName), "src/server/index.ts");
  if (!(await exists(p))) return false;
  const source = await readFile(p, "utf8");
  const routerVar = moduleRouterName(moduleName);
  return source.includes(`export { ${routerVar}`) || source.includes(`export const ${routerVar}`);
}

async function main() {
  const findings: Finding[] = [];
  const moduleNames = Object.keys(MODULES);
  const moduleSet = new Set(moduleNames);
  // Tracks which acknowledged gaps were actually hit, so we can flag stale ones.
  const consumedGaps = new Set<string>();

  // Check 1 : every package that exports a router is registered in the manifest.
  const packageDirs = (await readdir(resolve(APP_ROOT, "packages"), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const dir of packageDirs) {
    const candidate = `@monark/${dir}`;
    if (moduleSet.has(candidate)) continue;
    if (await hasRouter(candidate)) {
      findings.push({
        module: candidate,
        check: "router-in-manifest",
        severity: "error",
        message:
          "exports a tRPC router but is not in modules.manifest.ts — `pnpm gen` will drop it and CI drift-checks will fail. Add it with a tier.",
      });
    }
  }

  // Checks 2-5 : per-module completeness.
  for (const moduleName of moduleNames) {
    const dir = packageDirName(moduleName);

    // 2. package.json name matches the manifest key.
    const pkgName = await readPackageName(dir);
    if (pkgName !== moduleName) {
      findings.push({
        module: moduleName,
        check: "package-name",
        severity: "error",
        message: `packages/${dir}/package.json name is ${pkgName ?? "(missing)"} ; expected ${moduleName}.`,
      });
    }

    // 3. README.md exists.
    if (!(await exists(resolve(APP_ROOT, "packages", dir, "README.md")))) {
      findings.push({
        module: moduleName,
        check: "readme",
        severity: "error",
        message: `packages/${dir}/README.md is missing (every module documents its API + data model).`,
      });
    }

    // 4 + 5 apply only to modules with a tRPC surface.
    if (!(await hasRouter(moduleName))) continue;

    const softChecks: Array<{ check: string; ok: boolean; message: string }> = [
      {
        check: "events",
        ok: await exists(resolve(APP_ROOT, "packages", dir, "src/contracts/events.ts")),
        message:
          "has a tRPC router but no src/contracts/events.ts — its state changes can't join the DomainEvent union or the webhooks picker.",
      },
      {
        check: "integration-tests",
        ok: await exists(resolve(APP_ROOT, "packages", dir, "tests/integration")),
        message:
          "has a tRPC router but no tests/integration/ suite — its server surface is untested against a real database.",
      },
    ];

    for (const sc of softChecks) {
      if (sc.ok) continue;
      const key = `${moduleName}:${sc.check}`;
      if (ACKNOWLEDGED_GAPS.has(key)) {
        consumedGaps.add(key);
        findings.push({
          module: moduleName,
          check: sc.check,
          severity: "notice",
          message: sc.message,
        });
      } else {
        findings.push({
          module: moduleName,
          check: sc.check,
          severity: "error",
          message: sc.message,
        });
      }
    }
  }

  // Self-cleaning : an acknowledged gap that no longer applies must be removed.
  for (const key of ACKNOWLEDGED_GAPS) {
    if (!consumedGaps.has(key)) {
      const [module, check] = key.split(":");
      findings.push({
        module: module ?? key,
        check: check ?? "acknowledged-gap",
        severity: "error",
        message: `is listed in ACKNOWLEDGED_GAPS but the gap is resolved — remove "${key}" from tools/check-modules.ts.`,
      });
    }
  }

  const notices = findings.filter((f) => f.severity === "notice");
  const errors = findings.filter((f) => f.severity === "error");

  if (notices.length > 0) {
    console.log("check:modules: acknowledged gaps (visible debt, not failing) :");
    for (const n of notices) console.log(`  - ${n.module} [${n.check}] : ${n.message}`);
  }

  if (errors.length === 0) {
    console.log(
      `check:modules: ok (${moduleNames.length} modules checked, ${notices.length} acknowledged gap(s))`,
    );
    return;
  }

  console.error("check:modules: FAIL");
  for (const e of errors) console.error(`  ${e.module} [${e.check}] : ${e.message}`);
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
