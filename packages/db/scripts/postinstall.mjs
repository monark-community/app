// Wraps `prisma generate` so a Windows file lock on the query
// engine DLL doesn't fail the entire `pnpm install`. The lock
// happens whenever the dev server (or any other process holding the
// generated client open) is running while a contributor runs
// pnpm install ; prisma's atomic rename of
// `query_engine-windows.dll.node.tmpNNN -> query_engine-windows.dll.node`
// fails with EPERM/EBUSY/EACCES even though the existing client is
// already on disk and perfectly usable.
//
// On any other platform / non-lock failure we forward prisma's
// non-zero exit so a real schema-generation error still aborts the
// install. Linux / macOS don't have file-lock semantics that block
// rename ; CI on `ubuntu-latest` will keep aborting on real errors.
//
// .mjs (not .ts) so it runs without depending on tsx — postinstall
// can fire during a partial install where transitive devDeps (like
// tsx) haven't been linked yet.
import { spawnSync } from "node:child_process"

const result = spawnSync("prisma", ["generate"], {
  stdio: ["inherit", "inherit", "pipe"],
  shell: true,
  encoding: "utf8",
})

const stderr = result.stderr ?? ""
process.stderr.write(stderr)

if (result.status === 0) {
  process.exit(0)
}

const looksLikeWindowsLock =
  process.platform === "win32" && /EPERM|EBUSY|EACCES/i.test(stderr)

if (looksLikeWindowsLock) {
  console.warn(
    "\n[@monark/db postinstall] prisma generate hit a Windows file lock — " +
      "the query engine DLL is held open (dev server running?). The existing " +
      "generated client is still usable ; stop `pnpm dev` and run " +
      "`pnpm db:generate` after a schema change.\n",
  )
  process.exit(0)
}

process.exit(result.status ?? 1)
