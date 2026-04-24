import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { packageDirName, pascalCase, moduleEventsTypeName, moduleRouterName } from "./lib/names.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, "..")

type Tier = "core" | "extended"

function parseArgs(argv: string[]): { name: string; tier: Tier } {
  const args = argv.slice(2)
  const rawName = args[0]
  if (!rawName || rawName.startsWith("-")) {
    throw new Error("usage: pnpm gen:module <name> --tier core|extended")
  }
  const tierIndex = args.indexOf("--tier")
  if (tierIndex === -1 || !args[tierIndex + 1]) {
    throw new Error("--tier is required. Pass --tier core or --tier extended.")
  }
  const tier = args[tierIndex + 1]
  if (tier !== "core" && tier !== "extended") {
    throw new Error(`--tier must be "core" or "extended", got "${tier}"`)
  }
  const name = rawName.startsWith("@monark/") ? rawName.slice("@monark/".length) : rawName
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`module name must be kebab-case, got "${name}"`)
  }
  return { name, tier }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function writeIfAbsent(path: string, content: string): Promise<void> {
  if (await exists(path)) {
    throw new Error(`refusing to overwrite existing file: ${path}`)
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}

async function updateManifest(scopedName: string, tier: Tier): Promise<void> {
  const manifestPath = resolve(APP_ROOT, "modules.manifest.ts")
  const current = await readFile(manifestPath, "utf8")

  if (current.includes(`"${scopedName}"`)) {
    throw new Error(`module already registered in manifest: ${scopedName}`)
  }

  const entry = `  "${scopedName}": { tier: "${tier}" },`

  // Case 1: manifest is the empty-object form we scaffolded.
  if (current.includes("export const MODULES = {} as const")) {
    const replaced = current.replace(
      "export const MODULES = {} as const",
      `export const MODULES = {\n${entry}\n} as const`,
    )
    await writeFile(manifestPath, replaced, "utf8")
    return
  }

  // Case 2: manifest already has entries; insert before the closing brace of the literal.
  const closing = current.match(/\n} as const satisfies/)
  if (!closing) {
    throw new Error("cannot find MODULES object closing brace in modules.manifest.ts")
  }
  const replaced = current.replace(/\n} as const satisfies/, `\n${entry}\n} as const satisfies`)
  await writeFile(manifestPath, replaced, "utf8")
}

function renderPackageJson(name: string, tier: Tier): string {
  const scopedName = `@monark/${name}`
  void tier
  return `${JSON.stringify(
    {
      name: scopedName,
      version: "0.0.0",
      private: true,
      type: "module",
      exports: {
        "./server": "./src/server/index.ts",
        "./client": "./src/client/index.ts",
        "./contracts": "./src/contracts/index.ts",
      },
      scripts: {
        typecheck: "tsc --noEmit",
        lint: "eslint src",
        test: "vitest run --passWithNoTests",
      },
      dependencies: {
        "@monark/db": "workspace:*",
        "@monark/common": "workspace:*",
      },
      devDependencies: {
        vitest: "^3.0.0",
      },
    },
    null,
    2,
  )}\n`
}

const TSCONFIG = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true
  },
  "include": ["src/**/*"]
}
`

function renderServerIndex(name: string): string {
  const routerVar = moduleRouterName(`@monark/${name}`)
  return `import { router } from "@monark/common/trpc"

// Public surface of @monark/${name}/server.
// Export the tRPC sub-router as \`${routerVar}\` so gen:routers picks it up.
export const ${routerVar} = router({})
`
}

function renderClientIndex(): string {
  return `// Public surface of @monark/${"${name}"}/client.
// Export React components, hooks, and page composers here.

export {}
`
}

function renderContractsIndex(): string {
  return `export * from "./events.js"
`
}

function renderContractsEvents(name: string): string {
  const typeName = moduleEventsTypeName(`@monark/${name}`)
  return `import type { DomainEventBase } from "@monark/common/contracts/events"

// Declare individual event types for this module here, then include them
// in the ${typeName} union. gen:events picks up this union by name.

export type ${typeName} = DomainEventBase & { type: never }
`
}

const PLACEHOLDER_TEST = `import { describe, it, expect } from "vitest"

describe("placeholder", () => {
  it("runs", () => {
    expect(true).toBe(true)
  })
})
`

async function main() {
  const { name, tier } = parseArgs(process.argv)
  const scopedName = `@monark/${name}`
  const pkgDir = resolve(APP_ROOT, "packages", packageDirName(scopedName))

  if (await exists(pkgDir)) {
    throw new Error(`refusing to overwrite existing package directory: ${pkgDir}`)
  }

  await mkdir(pkgDir, { recursive: true })

  await writeIfAbsent(resolve(pkgDir, "package.json"), renderPackageJson(name, tier))
  await writeIfAbsent(resolve(pkgDir, "tsconfig.json"), TSCONFIG)
  await writeIfAbsent(resolve(pkgDir, "src/server/index.ts"), renderServerIndex(name))
  await writeIfAbsent(
    resolve(pkgDir, "src/client/index.ts"),
    renderClientIndex().replace("${name}", name),
  )
  await writeIfAbsent(resolve(pkgDir, "src/contracts/index.ts"), renderContractsIndex())
  await writeIfAbsent(resolve(pkgDir, "src/contracts/events.ts"), renderContractsEvents(name))
  await writeIfAbsent(resolve(pkgDir, "tests/placeholder.test.ts"), PLACEHOLDER_TEST)

  await updateManifest(scopedName, tier)

  const module = pascalCase(name)
  console.log(`gen:module: created ${scopedName} (${tier}).`)
  console.log(`  Next: run \`pnpm install\` then \`pnpm gen\` to refresh generated files.`)
  console.log(`  Scaffolded ${module}Events = never and ${moduleRouterName(scopedName)} stub.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
