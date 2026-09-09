import { existsSync, readFileSync } from "node:fs";

/**
 * A single parsed `.env` entry, kept alongside enough of the raw line to
 * explain *why* a value came out the way it did.
 *
 * The `rawValue` is what sat to the right of the first `=` before any
 * comment handling. It exists for one reason : Node's `--env-file`
 * parser (and dotenv, and Render's dashboard) treat an unquoted `#` as
 * the start of a comment, so `BRANDING_PRIMARY=#2563EB` silently
 * resolves to an empty string. That failure is invisible from
 * `process.env` alone — the variable is simply absent — and it costs an
 * operator a long time to find. Keeping the raw text lets a check say
 * "you wrote a hex colour but it parsed as empty ; quote it" instead of
 * "missing".
 */
export type EnvEntry = {
  key: string;
  /** Value after comment-stripping and unquoting : what the app will see. */
  value: string;
  /** Text to the right of `=`, before comment-stripping. */
  rawValue: string;
  /** 1-based line number, for pointing the operator at the right place. */
  line: number;
};

export type EnvFile = {
  path: string;
  exists: boolean;
  entries: Map<string, EnvEntry>;
};

/**
 * Minimal `.env` reader that mirrors Node's `--env-file` semantics
 * closely enough to predict what the app will actually see.
 *
 * Deliberately hand-rolled rather than pulling in `dotenv` : preflight
 * runs *before* the app, potentially before `pnpm install` has finished,
 * and under `node --experimental-strip-types` where a dependency graph
 * is a liability. It only needs to be right about the cases that bite:
 * quoting, comments, and blank values.
 */
export function readEnvFile(path: string): EnvFile {
  if (!existsSync(path)) {
    return { path, exists: false, entries: new Map() };
  }
  const entries = new Map<string, EnvEntry>();
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
    const rawValue = trimmed.slice(eq + 1);
    entries.set(key, {
      key,
      value: parseValue(rawValue),
      rawValue,
      line: index + 1,
    });
  });
  return { path, exists: true, entries };
}

/**
 * Resolve one raw value the way the runtime will.
 *
 * Quoted values are taken literally (this is the escape hatch that makes
 * `KEY="#2563EB"` work). Unquoted values are truncated at the first `#`,
 * which is exactly the behaviour that turns a hex colour into "".
 */
function parseValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  const hash = trimmed.indexOf("#");
  return (hash === -1 ? trimmed : trimmed.slice(0, hash)).trim();
}

/**
 * True when a value is empty *because* an unquoted `#` swallowed it.
 * This is the signature of the quoting trap, and it earns its own
 * message because "missing" would send the operator looking in the
 * wrong place — the line is right there in the file.
 */
export function isSwallowedByComment(entry: EnvEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.value !== "") return false;
  return entry.rawValue.trim().startsWith("#");
}

/**
 * Effective value for a key : the real process environment wins over the
 * file, matching how a container or a Render dashboard overrides a
 * checked-in `.env`. Returns an empty string when neither carries one.
 */
export function effectiveValue(file: EnvFile, key: string): string {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim() !== "") return fromProcess;
  return file.entries.get(key)?.value ?? "";
}
