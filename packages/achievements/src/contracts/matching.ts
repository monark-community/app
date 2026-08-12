/**
 * Pure rule-matching for the achievements engine — no DB, no side effects, so
 * the "does this event count, and for whom?" logic is unit-tested in isolation
 * and shared by the subscriber (enqueue decision) and the worker (crediting).
 *
 * A rule watches one registered event type (or one of its subscription
 * aliases), optionally filters on payload fields, and names the recipient via a
 * `subjectField` — which may resolve to a single user id (`actorId`) or an
 * array (`assigneeIds`), crediting one or many.
 */

/** Equality matchers on the event payload : `{ "toColumnId": "col_x" }`. */
export type AchievementMatch = Record<string, string>;

/** The rule shape the matcher needs (subset of the persisted row). */
export interface MatchableRule {
  eventType: string;
  subjectField: string;
  match?: AchievementMatch | null;
}

/** A domain event as a loose record (the matcher reads arbitrary payload keys). */
export type EventLike = { type: string; subscriptionAliases?: string[] } & Record<string, unknown>;

/** Whether the rule's event type matches the event (its `type` or an alias). */
export function ruleEventTypeMatches(ruleEventType: string, event: EventLike): boolean {
  if (event.type === ruleEventType) return true;
  return (event.subscriptionAliases ?? []).includes(ruleEventType);
}

/** Whether every configured payload matcher holds (string-equality ; a missing
 *  field never matches). No matchers → always true. */
export function payloadMatches(
  match: AchievementMatch | null | undefined,
  event: EventLike,
): boolean {
  if (!match) return true;
  for (const [key, expected] of Object.entries(match)) {
    const actual = event[key];
    if (actual === undefined || actual === null) return false;
    if (String(actual) !== String(expected)) return false;
  }
  return true;
}

/** The user id(s) to credit for this event, read from `subjectField` — a string
 *  yields one recipient, a string array yields many, anything else none. */
export function subjectsOf(event: EventLike, subjectField: string): string[] {
  const value = event[subjectField];
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  return [];
}

/** The recipients a rule credits for an event, or `[]` if it doesn't apply
 *  (wrong type or a failed payload match). Deduped. */
export function recipientsFor(rule: MatchableRule, event: EventLike): string[] {
  if (!ruleEventTypeMatches(rule.eventType, event)) return [];
  if (!payloadMatches(rule.match, event)) return [];
  return [...new Set(subjectsOf(event, rule.subjectField))];
}
