import { createServer, type Server } from "node:http";
import { runPreflight, type PreflightOptions, type PreflightReport } from "./checks";
import { renderHtml } from "./render";

export type SetupServerHandle = {
  server: Server;
  close: () => Promise<void>;
};

/**
 * Hold a port with an actionable setup page.
 *
 * This is what "spawns before the app" means in practice. When
 * configuration is incomplete the app is never started ; this server
 * takes the port it would have used, so whoever opens the URL — a
 * developer, or an operator hitting a fresh deployment — gets the list
 * of what is missing instead of a connection refused, a stack trace, or
 * a half-booted app that fails on the first query.
 *
 * Every request re-runs the checks rather than serving a cached report,
 * so the page reflects the file on disk right now. The checks are cheap
 * (file reads plus two TCP probes) and this server only exists while
 * something is broken, so there is nothing to optimise for.
 */
export function startSetupServer(opts: {
  port: number;
  host?: string;
  refreshSeconds?: number;
  checkOptions?: PreflightOptions;
  /** Called after each re-check, so a caller can hand off once green. */
  onReport?: (report: PreflightReport) => void;
}): Promise<SetupServerHandle> {
  const refreshSeconds = opts.refreshSeconds ?? 5;

  const server = createServer((req, res) => {
    void (async () => {
      const report = await runPreflight(opts.checkOptions);
      opts.onReport?.(report);

      // A JSON view for scripts and health probes ; the same data the
      // page renders, so a deploy pipeline can gate on it.
      if (req.url?.startsWith("/preflight.json")) {
        res.writeHead(report.ok ? 200 : 503, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify(report, null, 2));
        return;
      }

      // 503 rather than 200 : this is a real "not ready" state, and a
      // load balancer or uptime check should read it as one.
      res.writeHead(report.ok ? 200 : 503, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(renderHtml(report, { refreshSeconds }));
    })();
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(opts.port, opts.host ?? "0.0.0.0", () => {
      server.removeListener("error", rejectPromise);
      resolvePromise({
        server,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
