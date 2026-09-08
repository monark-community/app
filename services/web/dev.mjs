// Dev-server entry for `pnpm dev`.
//
// The port is not hardcoded any more ; it comes from this checkout's port slot
// (see .claude/agentkit and § Parallel work in CLAUDE.md), which the
// SessionStart hook writes into services/web/.env.local. Several worktrees run
// `pnpm dev` at the same time without racing for 3000, and the same worktree
// always comes back on the same port.
//
// `next dev` is spawned with an explicit --port because a flag is the only
// form Next honours unconditionally ; PORT in a .env file is read too late.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolvePort() {
  if (process.env.PORT) return process.env.PORT;
  for (const name of [".env.local", ".env"]) {
    const file = path.join(here, name);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^\s*PORT\s*=\s*(\d+)/m);
    if (match) return match[1];
  }
  return "3000";
}

const port = resolvePort();
const args = ["dev", "--turbopack", "--port", port, ...process.argv.slice(2)];

spawn("next", args, { cwd: here, stdio: "inherit", shell: true }).on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
