/**
 * One-shot launcher for the local dev tooling we lean on day-to-day.
 * Opens (or starts + opens) one of the auxiliary services running
 * alongside `pnpm dev` so the developer doesn't have to memorise
 * port numbers or fish around in `supabase status`.
 *
 * Usage:
 *
 *   pnpm dev:tools                # print the list, take no action
 *   pnpm dev:tools mail           # Inbucket (local outbound mail viewer)
 *   pnpm dev:tools supabase       # Supabase Studio
 *   pnpm dev:tools api            # Supabase API (Postgres REST + auth)
 *   pnpm dev:tools db             # Prisma Studio (long-running server)
 *   pnpm dev:tools web            # Next.js app
 *   pnpm dev:tools api-server     # Internal tRPC api
 *   pnpm dev:tools all            # Open every URL-based tool above
 *
 * Browser-launching is shell-out to the OS default ; portable across
 * macOS (`open`), Windows (`start`), and Linux (`xdg-open`). Prisma
 * Studio is delegated to `prisma studio` because it both serves AND
 * opens a tab ; the other entries are URL bookmarks.
 *
 * Adding a new tool: extend `TOOLS` below ; the help text auto-derives.
 */

import { spawn } from "node:child_process";

type Tool = {
  name: string;
  description: string;
  /**
   * URL to open in the default browser, OR a `{ command, args }` to
   * spawn (long-running). Use the URL form for everything but Prisma
   * Studio ; the spawn form is for tools that fuse "start the server"
   * and "open the browser" into one command.
   */
  open: { url: string } | { command: string; args: string[] };
};

const TOOLS: Tool[] = [
  {
    name: "mail",
    description: "Inbucket: local outbound-mail viewer (Supabase dev SMTP)",
    open: { url: "http://127.0.0.1:54324" },
  },
  {
    name: "supabase",
    description: "Supabase Studio: local DB + auth + storage admin UI",
    open: { url: "http://127.0.0.1:54323" },
  },
  {
    name: "api",
    description: "Supabase API gateway (REST + auth + realtime)",
    open: { url: "http://127.0.0.1:54321" },
  },
  {
    name: "db",
    description: "Prisma Studio: visual editor for the Postgres schema",
    // `prisma studio` runs in @monark/db so its node_modules resolve.
    open: {
      command: "pnpm",
      args: ["--filter", "@monark/db", "db:studio"],
    },
  },
  {
    name: "web",
    description: "Next.js web app (services/web on port 3000)",
    open: { url: "http://127.0.0.1:3000" },
  },
  {
    name: "api-server",
    description: "Internal tRPC api server (services/api on port 4000)",
    open: { url: "http://127.0.0.1:4000" },
  },
];

function openUrl(url: string): void {
  // Resolve the OS-default-browser command per platform. `start`
  // needs an empty title argument because the first arg is parsed
  // as a window title when the URL has spaces / special chars.
  const platform = process.platform;
  const [command, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", (err) => {
    console.error(`Failed to open ${url}: ${err.message}`);
    console.error(`URL: ${url}`);
    process.exitCode = 1;
  });
  // Detach so the parent process exits immediately ; the browser
  // handles the rest.
  child.unref();
  console.log(`→ ${url}`);
}

function spawnLongRunning(command: string, args: string[]): void {
  const child = spawn(command, args, {
    stdio: "inherit",
    // Windows requires shell:true so `pnpm` (a .cmd shim) is found.
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

function printHelp(): void {
  console.log("Usage: pnpm dev:tools <name>\n");
  console.log("Available tools:\n");
  const pad = TOOLS.reduce((max, t) => Math.max(max, t.name.length), 0);
  for (const tool of TOOLS) {
    console.log(`  ${tool.name.padEnd(pad)}   ${tool.description}`);
  }
  console.log(`  ${"all".padEnd(pad)}   Open every URL-based tool at once`);
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    printHelp();
    return;
  }
  if (arg === "all") {
    for (const tool of TOOLS) {
      if ("url" in tool.open) openUrl(tool.open.url);
    }
    return;
  }
  const tool = TOOLS.find((t) => t.name === arg);
  if (!tool) {
    console.error(`Unknown tool: ${arg}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }
  if ("url" in tool.open) {
    openUrl(tool.open.url);
  } else {
    spawnLongRunning(tool.open.command, tool.open.args);
  }
}

main();
