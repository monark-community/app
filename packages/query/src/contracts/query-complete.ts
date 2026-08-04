import {
  defaultOpForKind,
  legalOps,
  opValueArity,
  type FilterableKind,
  type FilterOp,
} from "./query";
import { dslPrefixForOp, matchDslPrefix } from "./query-dsl";
import { QUERY_VARIABLES, variablesForKind } from "./query-variables";

/**
 * The autocomplete engine for the text query bar. Given the raw input, the
 * caret offset, and the field schema, it returns ranked, structured
 * {@link Completion}s — fields, **operators**, values, `@variables`, and
 * boolean keywords — each carrying the exact text range to splice. Living in
 * `@monark/query` (not the web component) keeps it pure, unit-tested, and
 * reusable by every MQL surface (data-model records, kanban board, …).
 *
 * The engine is caret-aware : it completes the word the caret sits in (filtering
 * by what's typed up to the caret, replacing the whole word), so editing
 * mid-string works. Labels for operators/variables are language-neutral DSL
 * tokens plus an English `detail`; a caller that wants localized help can read
 * the `op` field and translate.
 */

export type CompletionKind = "field" | "operator" | "value" | "variable" | "keyword";

export interface Completion {
  kind: CompletionKind;
  /** The token shown in the menu (DSL form, e.g. `status:>`, `@me`, `OR`). */
  label: string;
  /** Optional secondary help — a field/option label, or an operator/variable meaning. */
  detail?: string;
  /** Text to splice in, replacing `[replaceStart, replaceEnd]`. */
  insertText: string;
  replaceStart: number;
  replaceEnd: number;
  /** Set on operator suggestions so a caller can localize the label from the op. */
  op?: FilterOp;
}

export interface CompletionField {
  key: string;
  label: string;
  kind: FilterableKind;
  options?: { value: string; label: string }[];
  /** Offer `@me` even when the kind isn't `relation` (e.g. a user-valued
   *  multi-select like a kanban assignee). */
  userValued?: boolean;
}

/** Optional label resolvers so a caller can localize the `detail` text without
 *  the engine depending on any i18n runtime. When omitted, English fallbacks
 *  ({@link OP_LABELS} / the variable's own description) are used. */
export interface CompletionOptions {
  describeOp?: (op: FilterOp) => string;
  describeVariable?: (token: string) => string;
}

/** Human meaning per operator (English fallback ; localize via `Completion.op`). */
const OP_LABELS: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  eq: "equals",
  neq: "not equal",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  between: "between (a..b)",
  before: "before",
  after: "after",
  onOrBefore: "on or before",
  onOrAfter: "on or after",
  isTrue: "is true",
  isFalse: "is false",
  isAnyOf: "is any of",
  isNoneOf: "is none of",
  hasAnyOf: "has any of",
  hasAllOf: "has all of",
  hasNoneOf: "has none of",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

const MAX = 14;
const WORD_BREAK = /[\s()]/;

/**
 * Suggestions for the query at `caret`. `fields` is the schema the query filters
 * over. Returns at most {@link MAX} completions, most-relevant first.
 */
export function getCompletions(
  text: string,
  caret: number,
  fields: CompletionField[],
  opts?: CompletionOptions,
): Completion[] {
  const clamped = Math.max(0, Math.min(caret, text.length));
  // The word the caret sits in : analyse what's typed up to the caret, but
  // replace the whole word (so mid-word editing doesn't duplicate the tail).
  let start = clamped;
  while (start > 0 && !WORD_BREAK.test(text[start - 1]!)) start -= 1;
  let end = clamped;
  while (end < text.length && !WORD_BREAK.test(text[end]!)) end += 1;

  const typed = text.slice(start, clamped);
  const negated = typed.startsWith("-");
  const core = negated ? typed.slice(1) : typed;
  const colon = core.indexOf(":");

  const range = { replaceStart: start, replaceEnd: end };
  return colon < 0
    ? fieldStage(core, negated, text, start, range, fields)
    : valueStage(core, colon, negated, range, fields, opts);
}

// ── field-name stage ─────────────────────────────────────

function fieldStage(
  core: string,
  negated: boolean,
  text: string,
  start: number,
  range: { replaceStart: number; replaceEnd: number },
  fields: CompletionField[],
): Completion[] {
  const q = core.toLowerCase();
  const neg = negated ? "-" : "";
  const out: Completion[] = fields
    .filter((f) => !q || f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
    .sort((a, b) => fieldRank(a, q) - fieldRank(b, q))
    .slice(0, MAX)
    .map((f) => ({
      kind: "field" as const,
      label: `${f.key}:`,
      detail: f.label,
      insertText: `${neg}${f.key}:`,
      ...range,
    }));

  // `OR` when the caret opens a fresh predicate slot after a completed one.
  if (core === "") {
    const before = text.slice(0, start).trimEnd();
    if (before.length > 0 && !before.endsWith("(") && !/\b(or|and)$/i.test(before)) {
      out.push({ kind: "keyword", label: "OR", insertText: "OR ", ...range });
    }
  }
  return out;
}

// key-prefix match ranks above label-prefix above substring, for stable order.
function fieldRank(f: CompletionField, q: string): number {
  if (!q) return 0;
  if (f.key.toLowerCase().startsWith(q)) return 0;
  if (f.label.toLowerCase().startsWith(q)) return 1;
  return 2;
}

// ── operator / value stage ───────────────────────────────

function valueStage(
  core: string,
  colon: number,
  negated: boolean,
  range: { replaceStart: number; replaceEnd: number },
  fields: CompletionField[],
  opts: CompletionOptions | undefined,
): Completion[] {
  const fieldKey = core.slice(0, colon);
  const field = fields.find((f) => f.key === fieldKey);
  if (!field) return [];
  const { prefix, value } = matchDslPrefix(core.slice(colon + 1));
  const vp = value.toLowerCase();
  const neg = negated ? "-" : "";
  const out: Completion[] = [];

  // Operators only while the user hasn't committed to a value yet (no prefix,
  // empty value) — they teach the syntax. Presence/boolean/default ops are
  // handled as values below.
  if (prefix === "" && value === "") {
    for (const op of legalOps(field.kind)) {
      if (op === defaultOpForKind(field.kind)) continue;
      if (opValueArity(op) === "none") continue;
      out.push(operatorCompletion(field.key, op, neg, range, opts));
    }
  }

  addValues(out, field, prefix, vp, neg, range, opts);
  return out.slice(0, MAX);
}

function operatorCompletion(
  fieldKey: string,
  op: FilterOp,
  neg: string,
  range: { replaceStart: number; replaceEnd: number },
  opts: CompletionOptions | undefined,
): Completion {
  const base = {
    kind: "operator" as const,
    op,
    detail: opts?.describeOp?.(op) ?? OP_LABELS[op],
    ...range,
  };
  // none-of prints as a negation of the field.
  if (op === "isNoneOf" || op === "hasNoneOf") {
    return { ...base, label: `-${fieldKey}:`, insertText: `-${fieldKey}:` };
  }
  if (op === "between") {
    return { ...base, label: `${fieldKey}:a..b`, insertText: `${neg}${fieldKey}:` };
  }
  const p = dslPrefixForOp(op) ?? "";
  return { ...base, label: `${fieldKey}:${p}`, insertText: `${neg}${fieldKey}:${p}` };
}

function addValues(
  out: Completion[],
  field: CompletionField,
  prefix: string,
  vp: string,
  neg: string,
  range: { replaceStart: number; replaceEnd: number },
  opts: CompletionOptions | undefined,
): void {
  const key = field.key;

  // Fixed-set options — show the human label, insert the (possibly opaque) value,
  // preserving any chosen prefix (e.g. `priority:>=HIGH` for an orderedSelect).
  if (field.options) {
    for (const opt of field.options) {
      if (!vp || opt.value.toLowerCase().includes(vp) || opt.label.toLowerCase().includes(vp)) {
        out.push({
          kind: "value",
          label: opt.label,
          insertText: `${neg}${key}:${prefix}${opt.value}`,
          ...range,
        });
      }
    }
  }

  // Booleans.
  if (field.kind === "boolean" && prefix === "") {
    for (const v of ["true", "false"]) {
      if (!vp || v.startsWith(vp)) {
        out.push({ kind: "value", label: `${key}:${v}`, insertText: `${key}:${v}`, ...range });
      }
    }
  }

  // Dynamic variables (`@me` for user-valued, `@today…` for dates).
  const vars = field.userValued
    ? QUERY_VARIABLES.filter((v) => v.kind === "user")
    : variablesForKind(field.kind);
  for (const v of vars) {
    if (!vp || v.token.toLowerCase().includes(vp)) {
      out.push({
        kind: "variable",
        label: `${key}:${v.token}`,
        detail: opts?.describeVariable?.(v.token) ?? v.description,
        insertText: `${neg}${key}:${prefix}${v.token}`,
        ...range,
      });
    }
  }

  // Presence keywords (only meaningful without a prefix).
  if (prefix === "") {
    for (const kw of ["empty", "present"]) {
      if (kw.startsWith(vp)) {
        out.push({ kind: "value", label: `${key}:${kw}`, insertText: `${key}:${kw}`, ...range });
      }
    }
  }
}
