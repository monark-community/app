import type { NodeExecutionContext } from "@monark/automation/server";
import { parseRepoRef, type GithubRepoRef } from "../../contracts/github";

// Config fields every GitHub node shares : which secret holds the token, and
// which repo to act on (accepts `owner/name` or a `{{ trigger.repo }}` ref).
export const TOKEN_FIELD = {
  key: "token",
  label: "Token secret",
  type: "secret",
  required: true,
  help: "A secret holding a GitHub token (a fine-grained PAT) with access to the repo.",
} as const;

export const REPO_FIELD = {
  key: "repository",
  label: "Repository",
  type: "text",
  required: true,
  placeholder: "owner/name",
  help: "The repository as owner/name (e.g. {{ trigger.repo }} on a GitHub trigger).",
} as const;

/** Resolve the token from the org's secret store via the run context, or throw. */
export async function requireToken(
  ctx: NodeExecutionContext,
  secretName: unknown,
): Promise<string> {
  if (typeof secretName !== "string" || secretName.trim() === "") {
    throw new Error("No token secret selected for this GitHub node.");
  }
  const token = await ctx.getSecret(secretName);
  if (!token) throw new Error(`GitHub token secret "${secretName}" is not set for this org.`);
  return token;
}

/** Parse the `repository` config into `{ owner, name }`, or throw a clear error. */
export function requireRepo(repository: unknown): GithubRepoRef {
  if (typeof repository !== "string") throw new Error("Repository is required (owner/name).");
  const ref = parseRepoRef(repository);
  if (!ref) throw new Error(`Invalid repository "${repository}" — expected owner/name.`);
  return ref;
}

/** Split a comma / newline separated string into trimmed, non-empty tokens. */
export function splitList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Clamp a limit config into a sane 1..100 range (GitHub's max page size). */
export function clampLimit(value: unknown, fallback = 30): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(n)));
}
