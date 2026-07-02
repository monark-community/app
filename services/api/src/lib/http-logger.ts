import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "@monark/common";

/**
 * Express request logger. One concise line per request, level chosen by
 * status code (info 2xx/3xx, warn 4xx, error 5xx) so pino-pretty's level
 * coloring lights up the failures. Strips bodies + headers from the
 * structured payload entirely ; pino's `redact` config already censors
 * cookies / authorization / supabase tokens, but the safest header is
 * the one we never log in the first place.
 *
 * Query strings are also stripped from the logged URL: tRPC GET queries
 * encode their input as `?input=…`, which can carry per-call values
 * (`cookieValue`, etc.) that we don't want in any line of any sink.
 *
 * Health probe lines are silenced so container probes / uptime checks
 * don't drown out real traffic. Add other noisy paths to `IGNORED_PATHS`
 * if they come up.
 */
const IGNORED_PATHS = new Set(["/health"]);

function stripQuery(url: string | undefined): string {
  if (!url) return "";
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

export const httpLogger = pinoHttp({
  logger,

  genReqId: (req) => {
    const incoming = req.headers["x-request-id"];
    if (typeof incoming === "string" && incoming.length > 0) return incoming;
    return randomUUID();
  },

  customLogLevel: (_req, res, err) => {
    if (err || (res.statusCode ?? 0) >= 500) return "error";
    if ((res.statusCode ?? 0) >= 400) return "warn";
    return "info";
  },

  customSuccessMessage: (req, res, responseTime) => {
    const status = res.statusCode ?? 0;
    return `${req.method} ${stripQuery(req.url)} ${status} ${responseTime.toFixed(0)}ms`;
  },

  customErrorMessage: (req, res, err) => {
    const status = res.statusCode ?? 500;
    const message = err instanceof Error ? err.message : "error";
    return `${req.method} ${stripQuery(req.url)} ${status} ${message}`;
  },

  // Structured payload kept tiny: id + method + url(no query) + status + duration.
  // No headers, no body, no query string echo. The message string already
  // carries the human-readable summary ; tooling that needs structured
  // fields gets the same data without any sensitive surface area.
  serializers: {
    req: (req: { id?: string; method?: string; url?: string }) => ({
      id: req.id,
      method: req.method,
      url: stripQuery(req.url),
    }),
    res: (res: { statusCode?: number }) => ({
      statusCode: res.statusCode,
    }),
  },

  // Silence health probes ; they hit every few seconds and add nothing.
  autoLogging: {
    ignore: (req) => IGNORED_PATHS.has(req.url ?? ""),
  },
});
