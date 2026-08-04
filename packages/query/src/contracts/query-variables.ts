import type { FilterableKind } from "./query";

/**
 * Dynamic query variables — `@me`, `@today`, relative date anchors — resolved
 * at **compile time** on the server against a {@link QueryContext} (the caller's
 * id + "now"), so a saved query like `assignee:@me due:@startOfWeek..@endOfWeek`
 * means the right thing for whoever runs it, whenever they run it. Values in a
 * `FilterLeaf` carry the raw `@token` string (the parser/printer treat it like
 * any other value) ; the compiler swaps it for a concrete bound value.
 *
 * Pure + isomorphic : the same definitions drive server resolution and the
 * client autocomplete. All date math is UTC, matching how dates round-trip.
 */

export type QueryContext = { userId: string; now: Date };

/** Which value slots a variable makes sense in (drives autocomplete). */
export type QueryVariableKind = "user" | "date";

export type QueryVariableDef = {
  token: string;
  kind: QueryVariableKind;
  /** Short human description (autocomplete secondary text). */
  description: string;
};

export const QUERY_VARIABLES: QueryVariableDef[] = [
  { token: "@me", kind: "user", description: "The current user" },
  { token: "@now", kind: "date", description: "Current date + time" },
  { token: "@today", kind: "date", description: "Start of today" },
  { token: "@yesterday", kind: "date", description: "Start of yesterday" },
  { token: "@tomorrow", kind: "date", description: "Start of tomorrow" },
  { token: "@startOfWeek", kind: "date", description: "Monday, this week" },
  { token: "@endOfWeek", kind: "date", description: "Monday, next week" },
  { token: "@startOfMonth", kind: "date", description: "First day of this month" },
  { token: "@endOfMonth", kind: "date", description: "First day of next month" },
  { token: "@startOfYear", kind: "date", description: "January 1, this year" },
  { token: "@endOfYear", kind: "date", description: "January 1, next year" },
];

/** A value string is a variable when it starts with `@`. */
export function isQueryVariable(value: string): boolean {
  return value.startsWith("@");
}

/** The variables relevant to a field kind, for autocomplete. */
export function variablesForKind(kind: FilterableKind): QueryVariableDef[] {
  if (kind === "date") return QUERY_VARIABLES.filter((v) => v.kind === "date");
  if (kind === "relation") return QUERY_VARIABLES.filter((v) => v.kind === "user");
  return [];
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

// Monday-based week start (ISO). getUTCDay(): 0 = Sunday … 6 = Saturday.
function startOfWeekUtc(d: Date): Date {
  const s = startOfDayUtc(d);
  const dow = s.getUTCDay();
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDaysUtc(s, -backToMonday);
}

/**
 * Resolve a `@variable` token to its concrete value against `ctx`, or `null`
 * if the token is unknown. Dates return an ISO string ; `@me` returns the
 * caller's user id. The caller (the query compiler) turns a `null` into a
 * user-facing error.
 */
export function resolveQueryVariable(token: string, ctx: QueryContext): string | null {
  if (token === "@me") return ctx.userId;
  const now = ctx.now;
  switch (token) {
    case "@now":
      return now.toISOString();
    case "@today":
      return startOfDayUtc(now).toISOString();
    case "@yesterday":
      return addDaysUtc(startOfDayUtc(now), -1).toISOString();
    case "@tomorrow":
      return addDaysUtc(startOfDayUtc(now), 1).toISOString();
    case "@startOfWeek":
      return startOfWeekUtc(now).toISOString();
    case "@endOfWeek":
      return addDaysUtc(startOfWeekUtc(now), 7).toISOString();
    case "@startOfMonth":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    case "@endOfMonth":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    case "@startOfYear":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    case "@endOfYear":
      return new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString();
    default:
      return null;
  }
}
