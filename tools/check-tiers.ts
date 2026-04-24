import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { MODULES } from "../modules.manifest.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, "..")

type ModuleTier = "core" | "extended"
type Violation = { module: string; dep: string; reason: string }

async function readPackageJson(modulePackageName: string): Promise<{ dependencies?: Record<string, string> } | null> {
  const packageDirName = modulePackageName.replace(/^@monark\//, "")
  const path = resolve(APP_ROOT, "packages", packageDirName, "package.json")
  try {
    const raw = await readFile(path, "utf8")
    return JSON.parse(raw) as { dependencies?: Record<string, string> }
  } catch {
    return null
  }
}

async function main() {
  const violations: Violation[] = []
  const moduleEntries = Object.entries(MODULES) as Array<[string, { tier: ModuleTier }]>

  for (const [moduleName, meta] of moduleEntries) {
    if (meta.tier !== "extended") continue

    const pkg = await readPackageJson(moduleName)
    if (!pkg) {
      violations.push({
        module: moduleName,
        dep: "(missing)",
        reason: `package.json not found for ${moduleName}`,
      })
      continue
    }

    const deps = Object.keys(pkg.dependencies ?? {})
    for (const dep of deps) {
      const depMeta = (MODULES as Record<string, { tier: ModuleTier }>)[dep]
      if (depMeta?.tier === "extended" && dep !== moduleName) {
        violations.push({
          module: moduleName,
          dep,
          reason: "extended module depends on another extended module",
        })
      }
    }
  }

  if (violations.length === 0) {
    console.log(`check:tiers: ok (${moduleEntries.length} modules checked)`)
    return
  }

  console.error("check:tiers: FAIL")
  for (const v of violations) {
    console.error(`  ${v.module} -> ${v.dep}: ${v.reason}`)
  }
  process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
