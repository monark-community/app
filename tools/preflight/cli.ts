import { spawn } from "node:child_process";
import { runPreflight } from "./checks";
import { renderTerminal } from "./render";
import { startSetupServer } from "./serve";

/**
 * Preflight : verify a deployment is configured, and stand in front of
 * the app when it isn't.
 *
 * Three modes, one check engine :
 *
 *   pnpm preflight                  report and exit (0 = safe to start)
 *   pnpm preflight --serve          hold a port with the setup page
 *   pnpm preflight --gate -- <cmd>  run <cmd> only once checks pass
 *
 * `--gate` is the one that matters in a deploy. It refuses to launch the
 * app against a broken configuration, and while it refuses it serves the
 * reason on the port the app would have taken — so the failure is
 * legible from a browser instead of buried in container logs. Once the
 * configuration is fixed it hands the port over and execs the real
 * command, no restart needed.
 *
 * Usage :
 *   pnpm preflight [--verbose] [--json] [--skip-network]
 *   pnpm preflight --serve [--port 3000]
 *   pnpm preflight --gate --port 3000 -- pnpm dev
 */

type Mode = "report" | "serve" | "gate";

function parseArgs(argv: string[]) {
  const separator = argv.indexOf("--");
  const flags = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);

  const has = (name: string) => flags.includes(`--${name}`);
  const value = (name: string, fallback: string): string => {
    const eq = flags.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const idx = flags.indexOf(`--${name}`);
    const next = idx >= 0 ? flags[idx + 1] : undefined;
    return next && !next.startsWith("--") ? next : fallback;
  };

  const mode: Mode = has("gate") ? "gate" : has("serve") ? "serve" : "report";
  return {
    mode,
    command,
    verbose: has("verbose"),
    json: has("json"),
    skipNetwork: has("skip-network"),
    // 3000 mirrors the web app's own default, so the setup page lands
    // exactly where someone would look for the app.
    port: Number(value("port", process.env.PORT ?? "3000")),
    interval: Number(value("interval", "5")),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const checkOptions = { skipNetwork: args.skipNetwork };

  if (args.mode === "report") {
    const report = await runPreflight(checkOptions);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderTerminal(report, { verbose: args.verbose }));
    }
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  if (args.mode === "serve") {
    const handle = await startSetupServer({
      port: args.port,
      refreshSeconds: args.interval,
      checkOptions,
    });
    console.log(`preflight : setup page on http://localhost:${args.port}`);
    process.on("SIGINT", () => void handle.close().then(() => process.exit(0)));
    process.on("SIGTERM", () => void handle.close().then(() => process.exit(0)));
    return;
  }

  // ── gate ───────────────────────────────────────────────────────────
  if (args.command.length === 0) {
    console.error("preflight --gate needs a command : pnpm preflight --gate -- pnpm dev");
    process.exitCode = 1;
    return;
  }

  let report = await runPreflight(checkOptions);
  if (!report.ok) {
    console.log(renderTerminal(report, { verbose: args.verbose }));
    console.log(
      `preflight : not starting the app. Serving the checklist on http://localhost:${args.port} until it passes.\n`,
    );

    // Hold the port and poll. The operator fixes `.env` in another
    // window ; when the checks go green we release the port and hand it
    // straight to the app, so there is no second command to remember.
    const handle = await startSetupServer({
      port: args.port,
      refreshSeconds: args.interval,
      checkOptions,
    });
    process.on("SIGINT", () => void handle.close().then(() => process.exit(0)));
    process.on("SIGTERM", () => void handle.close().then(() => process.exit(0)));

    report = await waitUntilPassing(checkOptions, args.interval);
    await handle.close();
    console.log("preflight : configuration complete, starting the app.\n");
  }

  launch(args.command);
}

/** Poll until every check passes. Resolves with the passing report. */
async function waitUntilPassing(
  checkOptions: { skipNetwork: boolean },
  intervalSeconds: number,
): Promise<Awaited<ReturnType<typeof runPreflight>>> {
  for (;;) {
    await new Promise((r) => setTimeout(r, Math.max(1, intervalSeconds) * 1000));
    const report = await runPreflight(checkOptions);
    if (report.ok) return report;
  }
}

/**
 * Replace this process's role with the real command.
 *
 * `stdio: "inherit"` keeps the app's output exactly as it would be
 * without the gate, and the child's exit code is propagated so a
 * supervisor (Render, k8s, a shell script) sees the app's status rather
 * than preflight's.
 */
function launch(command: string[]): void {
  const [bin, ...rest] = command;
  if (!bin) return;
  const child = spawn(bin, rest, { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main().catch((error: unknown) => {
  // A preflight tool that crashes is worse than one that reports
  // "unknown" ; surface the error but don't pretend the checks passed.
  console.error("preflight failed to run :", error);
  process.exitCode = 1;
});
