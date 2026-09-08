import type { CheckResult, PreflightReport } from "./checks";

const ESC = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
} as const;

const GLYPH: Record<CheckResult["status"], string> = {
  pass: `${ESC.green}✓${ESC.reset}`,
  warn: `${ESC.yellow}!${ESC.reset}`,
  fail: `${ESC.red}✗${ESC.reset}`,
};

/**
 * Terminal report.
 *
 * Passing checks collapse to one line each so the failures are what the
 * eye lands on ; a wall of green is noise when something is broken. Each
 * failure prints its fix indented underneath, because the whole point of
 * this tool is that the next action is on screen rather than in a doc.
 */
export function renderTerminal(report: PreflightReport, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`${ESC.bold}Preflight${ESC.reset}${ESC.dim} — checking this deployment${ESC.reset}`);
  lines.push("");

  for (const group of report.groups) {
    const interesting = group.results.filter((r) => r.status !== "pass");
    if (!opts.verbose && interesting.length === 0) {
      lines.push(
        `${GLYPH.pass} ${group.title} ${ESC.dim}(${group.results.length} checks)${ESC.reset}`,
      );
      continue;
    }
    lines.push(`${ESC.bold}${group.title}${ESC.reset}`);
    for (const result of group.results) {
      if (!opts.verbose && result.status === "pass") continue;
      lines.push(`  ${GLYPH[result.status]} ${result.title}`);
      if (result.status !== "pass") {
        lines.push(`      ${ESC.dim}${result.detail}${ESC.reset}`);
        if (result.fix) lines.push(`      ${ESC.cyan}→ ${result.fix}${ESC.reset}`);
      }
    }
    lines.push("");
  }

  if (report.ok && report.warnings === 0) {
    lines.push(`${ESC.green}✓ Everything checks out.${ESC.reset}`);
  } else if (report.ok) {
    lines.push(
      `${ESC.yellow}✓ Safe to start${ESC.reset}${ESC.dim} — ${report.warnings} warning(s) above are worth a look before launch.${ESC.reset}`,
    );
  } else {
    lines.push(
      `${ESC.red}✗ ${report.failures} problem(s) must be fixed before the app can start.${ESC.reset}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The page the setup server holds the port with.
 *
 * Self-contained : no CDN, no build step, no framework. It is served
 * precisely when the app can't start, so it cannot depend on anything
 * the app needs. It refreshes itself so an operator editing `.env` in
 * another window watches the list go green without touching the browser.
 */
export function renderHtml(report: PreflightReport, opts: { refreshSeconds: number }): string {
  const groups = report.groups
    .map((group) => {
      const rows = group.results
        .map((result) => {
          const fix = result.fix ? `<p class="fix">${escapeHtml(result.fix)}</p>` : "";
          return `
            <li class="row ${result.status}">
              <span class="glyph" aria-hidden="true"></span>
              <div>
                <p class="title">${escapeHtml(result.title)}</p>
                <p class="detail">${escapeHtml(result.detail)}</p>
                ${fix}
              </div>
            </li>`;
        })
        .join("");
      return `<section><h2>${escapeHtml(group.title)}</h2><ul>${rows}</ul></section>`;
    })
    .join("");

  const headline = report.ok
    ? "Configuration is complete"
    : `${report.failures} thing${report.failures === 1 ? "" : "s"} to fix before the app can start`;

  const sub = report.ok
    ? "The app is starting. This page will hand over as soon as it is listening."
    : "The app has not been started. Fix the items below; this page re-checks itself automatically.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${opts.refreshSeconds}">
<title>Setup — preflight</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfaf6; --fg: #17150f; --muted: #6c6858; --rule: #e2ded2;
    --card: #ffffff; --fail: #9e2b18; --warn: #7e5a0e; --pass: #2e6b47; --accent: #2c5d63;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131310; --fg: #f3efe4; --muted: #97917f; --rule: #302e26;
      --card: #1b1a15; --fail: #e5917c; --warn: #dbb463; --pass: #85c29b; --accent: #83c0c4;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 48px 20px 80px;
  }
  main { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); margin: 0 0 32px; }
  .status { display: inline-block; font: 600 11px/1 ui-monospace, monospace; letter-spacing: .12em;
            text-transform: uppercase; padding: 6px 9px; border-radius: 3px; margin-bottom: 18px; }
  .status.ok { background: color-mix(in srgb, var(--pass) 15%, transparent); color: var(--pass); }
  .status.bad { background: color-mix(in srgb, var(--fail) 15%, transparent); color: var(--fail); }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
       margin: 32px 0 10px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
  ul { list-style: none; margin: 0; padding: 0; }
  .row { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 11px 0;
         border-bottom: 1px solid var(--rule); }
  .row:last-child { border-bottom: 0; }
  .glyph { width: 9px; height: 9px; border-radius: 50%; margin-top: 7px; }
  .pass .glyph { background: var(--pass); }
  .warn .glyph { background: var(--warn); }
  .fail .glyph { background: var(--fail); }
  .title { margin: 0; font-weight: 600; }
  .pass .title { font-weight: 500; color: var(--muted); }
  .detail { margin: 3px 0 0; color: var(--muted); font-size: 14px; }
  .pass .detail { display: none; }
  .fix { margin: 8px 0 0; padding: 8px 11px; background: var(--card); border-left: 2px solid var(--accent);
         font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fg);
         overflow-x: auto; border-radius: 0 3px 3px 0; }
  footer { margin-top: 40px; color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<main>
  <span class="status ${report.ok ? "ok" : "bad"}">${report.ok ? "ready" : "not configured"}</span>
  <h1>${escapeHtml(headline)}</h1>
  <p class="sub">${escapeHtml(sub)}</p>
  ${groups}
  <footer>Re-checked every ${opts.refreshSeconds}s · last run ${escapeHtml(report.ranAt.toLocaleTimeString())} · <code>pnpm preflight</code> runs the same checks in your terminal.</footer>
</main>
</body>
</html>`;
}
