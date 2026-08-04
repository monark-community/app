import {
  defaultOpForKind,
  isOpLegal,
  leaf as makeLeaf,
  group as makeGroup,
  opValueArity,
  type FilterableKind,
  type FilterLeaf,
  type FilterNode,
  type FilterOp,
} from "./query";

/**
 * The text query language over a {@link FilterNode} tree — a parser (text →
 * tree) and a printer (tree → text), mirroring a tokenizer → recursive-descent
 * structure. The tree is the canonical form ; the text is a serialization the
 * query bar and the menu round-trip through, so a user can flip between typing
 * `status:open -assignee:present` and clicking the same conditions in the menu.
 *
 * Syntax (GitHub / Linear flavoured) :
 *   field:value                 default op for the field's kind
 *   field:a,b                   a list (any-of for select / multi-select)
 *   field:=value                explicit equality (text exact, case-insensitive)
 *   field:>value  >= < <=       comparison (number : gt… ; date : after…)
 *   field:~value  !~ ^ $        contains / notContains / startsWith / endsWith
 *   field:&a,b                  has-all-of (multi-select)
 *   field:a..b                  between (number / date)
 *   field:empty | field:present presence (is-empty / is-not-empty)
 *   field:true | field:false    boolean
 *   -field:...                   negation ( -field:a,b → none-of )
 *   a b        (implicit AND)    a OR b         ( parentheses group )
 *
 * Field kinds are resolved through a caller-supplied {@link FieldKinds} map, the
 * same metadata the compiler + autocomplete read — an unknown field or an
 * operator illegal for the field's kind is a {@link QuerySyntaxError}.
 */

export class QuerySyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuerySyntaxError";
  }
}

/** field key → the kind it filters as. */
export type FieldKinds = Map<string, FilterableKind>;

/** Build a {@link FieldKinds} map from `(key, kind)` pairs — a consumer resolves
 *  its own field types to a {@link FilterableKind} first. */
export function fieldKindsFrom(fields: Array<{ key: string; kind: FilterableKind }>): FieldKinds {
  const map: FieldKinds = new Map();
  for (const f of fields) map.set(f.key, f.kind);
  return map;
}

// ── prefix ⇔ operator tables ─────────────────────────────

// The explicit value-prefix each operator prints as (only used when the op is
// NOT the field kind's default). `between` / presence / boolean have their own
// value shapes and never take a prefix.
const PREFIX_BY_OP: Partial<Record<FilterOp, string>> = {
  is: "=",
  eq: "=",
  isNot: "!=",
  neq: "!=",
  gt: ">",
  after: ">",
  gte: ">=",
  onOrAfter: ">=",
  lt: "<",
  before: "<",
  lte: "<=",
  onOrBefore: "<=",
  contains: "~",
  notContains: "!~",
  startsWith: "^",
  endsWith: "$",
  hasAllOf: "&",
};

// Longest first, so `>=` matches before `>`.
const PREFIXES = ["!=", ">=", "<=", "!~", "=", ">", "<", "~", "^", "$", "&"];

/** The DSL value-prefix an operator prints as (`gt` → `>`), or `undefined` for
 *  the kind's default op / ops with their own value shape. Exposed for the
 *  completion engine so it can offer operator forms without re-deriving them. */
export function dslPrefixForOp(op: FilterOp): string | undefined {
  return PREFIX_BY_OP[op];
}

/** Split a post-colon remainder into its leading operator prefix (if any) and
 *  the value part — the same detection the parser uses, exposed for completion. */
export function matchDslPrefix(rest: string): { prefix: string; value: string } {
  for (const p of PREFIXES) {
    if (rest.startsWith(p)) return { prefix: p, value: rest.slice(p.length) };
  }
  return { prefix: "", value: rest };
}

function resolveOp(kind: FilterableKind, prefix: string): FilterOp {
  switch (prefix) {
    case "":
      return defaultOpForKind(kind);
    case "=":
      return kind === "number" ? "eq" : kind === "date" ? "is" : kind === "text" ? "is" : "isAnyOf";
    case "!=":
      return kind === "number"
        ? "neq"
        : kind === "text"
          ? "isNot"
          : kind === "multiSelect"
            ? "hasNoneOf"
            : "isNoneOf";
    case ">":
      return kind === "date" ? "after" : "gt";
    case ">=":
      return kind === "date" ? "onOrAfter" : "gte";
    case "<":
      return kind === "date" ? "before" : "lt";
    case "<=":
      return kind === "date" ? "onOrBefore" : "lte";
    case "~":
      return "contains";
    case "!~":
      return "notContains";
    case "^":
      return "startsWith";
    case "$":
      return "endsWith";
    case "&":
      return "hasAllOf";
    default:
      throw new QuerySyntaxError(`Unknown operator "${prefix}".`);
  }
}

// ── tokenizer ────────────────────────────────────────────

type Token =
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "or" }
  | { type: "term"; raw: string };

const MAX_QUERY_LENGTH = 4000;

function tokenize(input: string): Token[] {
  if (input.length > MAX_QUERY_LENGTH) {
    throw new QuerySyntaxError(`Query is too long (max ${MAX_QUERY_LENGTH} characters).`);
  }
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i] as string;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    // A term runs until whitespace or a paren, but a quoted segment may contain
    // either — read quote-aware.
    let raw = "";
    while (i < n) {
      const c = input[i] as string;
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "(" || c === ")") break;
      if (c === '"' || c === "'") {
        const quote = c;
        raw += c;
        i += 1;
        while (i < n && input[i] !== quote) {
          if (input[i] === "\\" && i + 1 < n) {
            raw += input[i]! + input[i + 1]!;
            i += 2;
            continue;
          }
          raw += input[i];
          i += 1;
        }
        if (i >= n) throw new QuerySyntaxError("Unterminated quoted value.");
        raw += input[i]; // closing quote
        i += 1;
        continue;
      }
      raw += c;
      i += 1;
    }
    if (raw === "OR" || raw === "or" || raw === "|") tokens.push({ type: "or" });
    else if (raw === "AND" || raw === "and")
      continue; // implicit AND ; word is a no-op separator
    else tokens.push({ type: "term", raw });
  }
  return tokens;
}

// ── value helpers ────────────────────────────────────────

/** Split on commas at the top level, honouring quotes. */
function splitValues(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === '"' || c === "'") {
      const quote = c;
      i += 1;
      while (i < s.length && s[i] !== quote) {
        if (s[i] === "\\" && i + 1 < s.length) {
          cur += s[i + 1];
          i += 2;
          continue;
        }
        cur += s[i];
        i += 1;
      }
      i += 1; // closing quote
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  out.push(cur);
  return out;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return t;
}

// ── predicate parsing ────────────────────────────────────

function parsePredicate(raw: string, kinds: FieldKinds): FilterNode {
  let text = raw;
  let negated = false;
  if (text.startsWith("-")) {
    negated = true;
    text = text.slice(1);
  }
  const colon = text.indexOf(":");
  if (colon < 0) {
    throw new QuerySyntaxError(`Expected "field:value" but got "${raw}".`);
  }
  const field = text.slice(0, colon);
  const rest = text.slice(colon + 1);
  if (!field) throw new QuerySyntaxError(`Missing field name in "${raw}".`);
  const kind = kinds.get(field);
  if (!kind) throw new QuerySyntaxError(`Unknown field "${field}".`);

  const built = buildLeaf(field, kind, rest);

  if (!negated) return built;
  // Negation folds a set-membership into its none-of counterpart ; anything
  // else becomes a negated group so it prints back as `-(…)`.
  if (built.op === "isAnyOf") return makeLeaf(field, "isNoneOf", built.value);
  if (built.op === "hasAnyOf") return makeLeaf(field, "hasNoneOf", built.value);
  return makeGroup("and", [built], true);
}

function buildLeaf(field: string, kind: FilterableKind, rest: string): FilterLeaf {
  const bare = rest.trim();

  // Presence keywords (unquoted).
  if (bare === "empty") return legal(field, kind, makeLeaf(field, "isEmpty"));
  if (bare === "present") return legal(field, kind, makeLeaf(field, "isNotEmpty"));

  // File fields only support presence.
  if (kind === "attachments") {
    throw new QuerySyntaxError(`Field "${field}" supports only :empty / :present.`);
  }

  // Boolean value form.
  if (kind === "boolean") {
    const v = unquote(bare).toLowerCase();
    if (["true", "yes", "1"].includes(v)) return makeLeaf(field, "isTrue");
    if (["false", "no", "0"].includes(v)) return makeLeaf(field, "isFalse");
    throw new QuerySyntaxError(`Expected true/false for "${field}".`);
  }

  // Detect a leading operator prefix.
  let prefix = "";
  let valuePart = bare;
  for (const p of PREFIXES) {
    if (bare.startsWith(p)) {
      prefix = p;
      valuePart = bare.slice(p.length);
      break;
    }
  }

  // Range (a..b) → between.
  const rangeIdx = valuePart.indexOf("..");
  if (prefix === "" && rangeIdx >= 0) {
    const a = unquote(valuePart.slice(0, rangeIdx));
    const b = unquote(valuePart.slice(rangeIdx + 2));
    return legal(field, kind, makeLeaf(field, "between", [a, b]));
  }

  const op = resolveOp(kind, prefix);
  const arity = opValueArity(op);
  const values = splitValues(valuePart).map(unquote);
  if (arity === "scalar") {
    if (values.length !== 1) throw new QuerySyntaxError(`"${field}" expects a single value.`);
    return legal(field, kind, makeLeaf(field, op, values[0]!));
  }
  if (arity === "list") {
    const vals = values.filter((v) => v !== "");
    if (vals.length === 0) throw new QuerySyntaxError(`"${field}" expects at least one value.`);
    return legal(field, kind, makeLeaf(field, op, vals));
  }
  // pair handled by the range branch ; none-arity handled above.
  throw new QuerySyntaxError(`"${field}" got a value it doesn't take.`);
}

function legal(field: string, kind: FilterableKind, leaf: FilterLeaf): FilterLeaf {
  if (!isOpLegal(kind, leaf.op)) {
    throw new QuerySyntaxError(`Operator is not valid for field "${field}".`);
  }
  return leaf;
}

// ── recursive-descent over tokens ────────────────────────

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly kinds: FieldKinds,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  parse(): FilterNode | null {
    if (this.tokens.length === 0) return null;
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new QuerySyntaxError("Unexpected trailing input (check your parentheses).");
    }
    return node;
  }

  private parseOr(): FilterNode {
    const parts = [this.parseAnd()];
    while (this.peek()?.type === "or") {
      this.pos += 1;
      parts.push(this.parseAnd());
    }
    return parts.length === 1 ? parts[0]! : makeGroup("or", parts);
  }

  private parseAnd(): FilterNode {
    const parts: FilterNode[] = [this.parseFactor()];
    for (;;) {
      const t = this.peek();
      if (!t || t.type === "or" || t.type === "rparen") break;
      parts.push(this.parseFactor());
    }
    return parts.length === 1 ? parts[0]! : makeGroup("and", parts);
  }

  private parseFactor(): FilterNode {
    const t = this.peek();
    if (!t) throw new QuerySyntaxError("Unexpected end of query.");
    if (t.type === "lparen") {
      this.pos += 1;
      const inner = this.parseOr();
      if (this.peek()?.type !== "rparen") throw new QuerySyntaxError('Missing ")".');
      this.pos += 1;
      return inner;
    }
    if (t.type === "term") {
      this.pos += 1;
      // A lone "-" before a group negates it.
      if (t.raw === "-") {
        const inner = this.parseFactor();
        return inner.kind === "group"
          ? { ...inner, negate: !inner.negate }
          : makeGroup("and", [inner], true);
      }
      return parsePredicate(t.raw, this.kinds);
    }
    throw new QuerySyntaxError('Unexpected ")" or operator.');
  }
}

/** Parse a query string into a {@link FilterNode} tree (or `null` when empty).
 *  Throws {@link QuerySyntaxError} on any syntax / unknown-field / illegal-op
 *  problem. */
export function parseQuery(input: string, kinds: FieldKinds): FilterNode | null {
  return new Parser(tokenize(input), kinds).parse();
}

// ── printer ──────────────────────────────────────────────

function needsQuote(v: string): boolean {
  return (
    v === "" ||
    /[\s,:()"']/.test(v) ||
    v.includes("..") ||
    /^[-><=~!^$&]/.test(v) ||
    ["empty", "present", "true", "false", "OR", "or", "AND", "and"].includes(v)
  );
}

function quote(v: string): string {
  return needsQuote(v) ? `"${v.replace(/(["\\])/g, "\\$1")}"` : v;
}

function printLeaf(leaf: FilterLeaf, kinds: FieldKinds): string {
  const field = leaf.field;
  const kind = kinds.get(field);
  const val = leaf.value;
  const list = Array.isArray(val) ? val : val === undefined ? [] : [val];

  switch (leaf.op) {
    case "isEmpty":
      return `${field}:empty`;
    case "isNotEmpty":
      return `${field}:present`;
    case "isTrue":
      return `${field}:true`;
    case "isFalse":
      return `${field}:false`;
    case "between":
      return `${field}:${quote(list[0] ?? "")}..${quote(list[1] ?? "")}`;
    case "isNoneOf":
      return `-${field}:${list.map(quote).join(",")}`;
    case "hasNoneOf":
      return `-${field}:${list.map(quote).join(",")}`;
    default: {
      const isDefault = kind !== undefined && leaf.op === defaultOpForKind(kind);
      const prefix = isDefault ? "" : (PREFIX_BY_OP[leaf.op] ?? "");
      return `${field}:${prefix}${list.map(quote).join(",")}`;
    }
  }
}

function printNode(node: FilterNode, kinds: FieldKinds): string {
  if (node.kind === "leaf") return printLeaf(node, kinds);
  const sep = node.combinator === "and" ? " " : " OR ";
  const inner = node.children
    .map((child) => {
      const s = printNode(child, kinds);
      // A same-combinator, non-negated child group is associative → no parens ;
      // a differing combinator needs them. Negated groups self-delimit as -(…).
      if (child.kind === "group" && !child.negate && child.combinator !== node.combinator) {
        return `(${s})`;
      }
      return s;
    })
    .join(sep);
  return node.negate ? `-(${inner})` : inner;
}

/** Serialize a {@link FilterNode} tree back to query text that {@link parseQuery}
 *  round-trips (given the same field kinds). */
export function printQuery(node: FilterNode, kinds: FieldKinds): string {
  return printNode(node, kinds);
}
