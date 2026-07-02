import pino, { type LoggerOptions } from "pino";

const isProd = process.env.NODE_ENV === "production";
// `process.stdout.isTTY` is true when stdout is attached to a terminal
// (local `pnpm dev`, not a piped `>file` or systemd journal). The check
// keeps prod / CI / aggregator pipelines on machine-parseable JSON while
// dev gets coloured one-liners via pino-pretty.
const isTty = Boolean(process.stdout.isTTY);
const usePretty = !isProd && isTty;

/**
 * Redaction list. Hits the structured-log shape only — any object key
 * matching a path here is replaced with `[REDACTED]` before the line
 * is emitted. Add a path whenever you find a field that could carry a
 * credential. The list is intentionally broad ; over-redaction in dev
 * is cheap, leaking a token isn't.
 *
 * Paths use pino's redact syntax: `a.b.c` for nested keys, `*.foo` for
 * `foo` on any first-level child.
 */
export const REDACT_PATHS = [
  // HTTP request headers.
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "req.headers['x-supabase-auth']",
  "req.headers['x-api-key']",
  "req.headers['x-csrf-token']",
  "req.headers['proxy-authorization']",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  // Common credential-bearing fields anywhere in a structured payload.
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.access_token",
  "*.refresh_token",
  "*.tokenHash",
  "*.secret",
  "*.secretCipher",
  "*.cookieValue",
  "*.cookieHash",
];

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "monark" },
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
};

export const logger = usePretty
  ? pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          // 14:32:05.123 — short enough to scan, includes ms.
          translateTime: "HH:MM:ss.l",
          // Drop the noisy hostname / pid / service prefix in the
          // human-facing line ; they're still in the JSON if `LOG_LEVEL=debug`
          // forces structured output through a downstream collector.
          ignore: "pid,hostname,service",
          singleLine: true,
        },
      },
    })
  : pino(baseOptions);
