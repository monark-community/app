/**
 * The formula expression engine for the polymorphic Data Model engine's
 * `FORMULA` field type. A safe (no `eval`), self-contained mini-language:
 * tokenizer -> recursive-descent parser -> tree-walking evaluator. Pure and
 * isomorphic, so the SAME implementation runs server-side (authoritative
 * compute-on-write in `server/data.ts`) and client-side (the live preview a
 * `FORMULA` field renders in the record form). One engine, like
 * {@link valueSchemaFor} is one validator.
 *
 * v1 scope: **same-record** references only — a formula reads sibling field
 * values on its own record (by field key), does arithmetic / string / logic /
 * date work, and yields one scalar. No cross-record rollups (that needs a
 * dependency-invalidation system this deliberately omits).
 *
 * Grammar (low -> high precedence):
 *   or       := and ( "||" and )*
 *   and      := cmp ( "&&" cmp )*
 *   cmp      := concat ( ("=="|"!="|"<"|"<="|">"|">=") concat )*
 *   concat   := add ( "&" add )*            // string concatenation
 *   add      := mul ( ("+"|"-") mul )*      // arithmetic only (use & to join text)
 *   mul      := unary ( ("*"|"/"|"%") unary )*
 *   unary    := ("!"|"-") unary | primary
 *   primary  := number | string | "true" | "false" | "null"
 *             | ident "(" args? ")"          // function call
 *             | ident                         // field reference (by key)
 *             | "(" or ")"
 */

/** The value a formula produces, and the value type a scope entry may hold. */
export type FormulaValue = string | number | boolean | Date | null;

/** Field values keyed by `DataField.key`, as read off a record's `data`. */
export type FormulaScope = Record<string, unknown>;

/** The declared output type of a `FORMULA` field, mirrored in its config. */
export const FORMULA_RESULT_TYPES = ["TEXT", "NUMBER", "BOOLEAN", "DATE"] as const;
export type FormulaResultType = (typeof FORMULA_RESULT_TYPES)[number];

/** Thrown for any tokenize / parse failure (a user-visible syntax error). */
export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

// ── AST ──────────────────────────────────────────────────

type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "&"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||";

export type FormulaNode =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "ref"; name: string }
  | { kind: "call"; name: string; args: FormulaNode[] }
  | { kind: "unary"; op: "-" | "!"; operand: FormulaNode }
  | { kind: "binary"; op: BinaryOp; left: FormulaNode; right: FormulaNode };

// ── Tokenizer ────────────────────────────────────────────

interface Token {
  type: "num" | "str" | "ident" | "op";
  value: string;
  pos: number;
}

// Multi-char operators must be matched before their single-char prefixes.
const MULTI_OPS = ["==", "!=", "<=", ">=", "&&", "||"];
const SINGLE_OPS = new Set(["+", "-", "*", "/", "%", "&", "(", ")", ",", "<", ">", "!"]);

function isIdentStart(ch: string): boolean {
  return /[a-zA-Z_]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}
function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

// Backstop caps against pathological input (a very long or deeply-nested
// expression drives CPU / parser recursion). Legit formulas are far smaller;
// callers may impose tighter per-field limits on top of these.
const MAX_FORMULA_LENGTH = 10_000;
const MAX_PARSE_DEPTH = 64;

function tokenize(input: string): Token[] {
  if (input.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(`Formula is too long (max ${MAX_FORMULA_LENGTH} characters).`);
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

    // String literal — single or double quoted, with simple escapes.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i += 1;
      let value = "";
      while (i < n && input[i] !== quote) {
        const c = input[i] as string;
        if (c === "\\") {
          const next = input[i + 1];
          if (next === undefined) throw new FormulaError("Unterminated string");
          value += next === "n" ? "\n" : next === "t" ? "\t" : next; // \\, \", \', \n, \t
          i += 2;
          continue;
        }
        value += c;
        i += 1;
      }
      if (i >= n) throw new FormulaError("Unterminated string literal");
      i += 1; // closing quote
      tokens.push({ type: "str", value, pos: start });
      continue;
    }

    // Number literal — integer or decimal (no exponent).
    if (isDigit(ch) || (ch === "." && isDigit(input[i + 1] ?? ""))) {
      const start = i;
      let value = "";
      while (i < n && (isDigit(input[i] as string) || input[i] === ".")) {
        value += input[i];
        i += 1;
      }
      if ((value.match(/\./g)?.length ?? 0) > 1) {
        throw new FormulaError(`Invalid number "${value}"`);
      }
      tokens.push({ type: "num", value, pos: start });
      continue;
    }

    // Identifier / keyword.
    if (isIdentStart(ch)) {
      const start = i;
      let value = "";
      while (i < n && isIdentPart(input[i] as string)) {
        value += input[i];
        i += 1;
      }
      tokens.push({ type: "ident", value, pos: start });
      continue;
    }

    // Operators / punctuation.
    const two = input.slice(i, i + 2);
    if (MULTI_OPS.includes(two)) {
      tokens.push({ type: "op", value: two, pos: i });
      i += 2;
      continue;
    }
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i += 1;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

// ── Parser ───────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new FormulaError("Unexpected end of expression");
    this.pos += 1;
    return tok;
  }
  private eatOp(value: string): void {
    const tok = this.peek();
    if (!tok || tok.type !== "op" || tok.value !== value) {
      throw new FormulaError(`Expected "${value}"`);
    }
    this.pos += 1;
  }
  private isOp(value: string): boolean {
    const tok = this.peek();
    return !!tok && tok.type === "op" && tok.value === value;
  }

  parse(): FormulaNode {
    if (this.tokens.length === 0) throw new FormulaError("Empty formula");
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos] as Token;
      throw new FormulaError(`Unexpected "${tok.value}"`);
    }
    return node;
  }

  private parseBinaryLevel(ops: string[], nextLevel: () => FormulaNode): FormulaNode {
    let left = nextLevel();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.type !== "op" || !ops.includes(tok.value)) break;
      this.pos += 1;
      const right = nextLevel();
      left = { kind: "binary", op: tok.value as BinaryOp, left, right };
    }
    return left;
  }

  // Recursion-depth guard: `parseOr` is re-entered on every `(` group and
  // function argument, and `parseUnary` on every unary chain, so counting here
  // bounds nesting and stops a `((((…))))` / `----…x` input from overflowing the
  // stack. Legit formulas nest only a handful deep.
  private depth = 0;
  private enterDepth(): void {
    if (++this.depth > MAX_PARSE_DEPTH) {
      throw new FormulaError("Formula is too deeply nested.");
    }
  }

  private parseOr(): FormulaNode {
    this.enterDepth();
    try {
      return this.parseBinaryLevel(["||"], () => this.parseAnd());
    } finally {
      this.depth -= 1;
    }
  }
  private parseAnd(): FormulaNode {
    return this.parseBinaryLevel(["&&"], () => this.parseCmp());
  }
  private parseCmp(): FormulaNode {
    return this.parseBinaryLevel(["==", "!=", "<", "<=", ">", ">="], () => this.parseConcat());
  }
  private parseConcat(): FormulaNode {
    return this.parseBinaryLevel(["&"], () => this.parseAdd());
  }
  private parseAdd(): FormulaNode {
    return this.parseBinaryLevel(["+", "-"], () => this.parseMul());
  }
  private parseMul(): FormulaNode {
    return this.parseBinaryLevel(["*", "/", "%"], () => this.parseUnary());
  }

  private parseUnary(): FormulaNode {
    this.enterDepth();
    try {
      if (this.isOp("!") || this.isOp("-")) {
        const op = this.next().value as "!" | "-";
        return { kind: "unary", op, operand: this.parseUnary() };
      }
      return this.parsePrimary();
    } finally {
      this.depth -= 1;
    }
  }

  private parsePrimary(): FormulaNode {
    const tok = this.next();
    if (tok.type === "num") return { kind: "num", value: Number(tok.value) };
    if (tok.type === "str") return { kind: "str", value: tok.value };
    if (tok.type === "op" && tok.value === "(") {
      const inner = this.parseOr();
      this.eatOp(")");
      return inner;
    }
    if (tok.type === "ident") {
      const lower = tok.value.toLowerCase();
      if (lower === "true") return { kind: "bool", value: true };
      if (lower === "false") return { kind: "bool", value: false };
      if (lower === "null") return { kind: "null" };
      // A "(" immediately after an identifier makes it a function call ;
      // otherwise it's a bare field reference (by key).
      if (this.isOp("(")) return this.parseCall(tok.value);
      return { kind: "ref", name: tok.value };
    }
    throw new FormulaError(`Unexpected "${tok.value}"`);
  }

  private parseCall(name: string): FormulaNode {
    const lower = name.toLowerCase();
    // `Object.hasOwn` so inherited Object props ("constructor", "toString", …)
    // aren't mistaken for known functions.
    const def = Object.hasOwn(FUNCTIONS, lower) ? FUNCTIONS[lower] : undefined;
    if (!def) throw new FormulaError(`Unknown function "${name}"`);
    this.eatOp("(");
    const args: FormulaNode[] = [];
    if (!this.isOp(")")) {
      args.push(this.parseOr());
      while (this.isOp(",")) {
        this.eatOp(",");
        args.push(this.parseOr());
      }
    }
    this.eatOp(")");
    if (args.length < def.minArgs || args.length > def.maxArgs) {
      const range =
        def.maxArgs === Infinity
          ? `at least ${def.minArgs}`
          : def.minArgs === def.maxArgs
            ? `${def.minArgs}`
            : `${def.minArgs}–${def.maxArgs}`;
      throw new FormulaError(`"${lower}" expects ${range} argument(s), got ${args.length}`);
    }
    return { kind: "call", name: lower, args };
  }
}

/** Parse an expression to its AST. Throws {@link FormulaError} on bad syntax. */
export function parseFormula(expression: string): FormulaNode {
  return new Parser(tokenize(expression)).parse();
}

// ── Coercion helpers ─────────────────────────────────────

function toNumber(v: FormulaValue): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null; // Date / null -> not a number (use date functions for dates)
}

function toStringValue(v: FormulaValue): string {
  if (v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return "";
}

function toBoolean(v: FormulaValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0 && v.toLowerCase() !== "false";
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  return false; // null
}

function toDateValue(v: FormulaValue): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Normalize an arbitrary scope value into a {@link FormulaValue}. Arrays
 *  (multi-select / to-many relation) collapse to a comma-joined string, which
 *  is the only sensible scalar view v1 offers for them. */
function normalizeScopeValue(raw: unknown): FormulaValue {
  if (raw === null || raw === undefined) return null;
  if (
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    raw instanceof Date
  ) {
    return raw;
  }
  if (Array.isArray(raw)) return raw.map((x) => toStringValue(normalizeScopeValue(x))).join(", ");
  return null;
}

// Milliseconds per fixed-length unit. String-indexed on purpose so an
// arbitrary (possibly invalid) unit string looks up to `number | undefined`
// under noUncheckedIndexedAccess, letting the guards below stay meaningful.
const MS_PER: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  return u.endsWith("s") ? u : `${u}s`;
}

// All date component / calendar math uses UTC, so results are timezone
// independent and agree with how values round-trip (ISO strings in JSONB).
function shiftDate(date: Date, amount: number, unit: string): Date | null {
  const u = normalizeUnit(unit);
  const d = new Date(date.getTime());
  if (u === "months") {
    d.setUTCMonth(d.getUTCMonth() + amount);
    return d;
  }
  if (u === "years") {
    d.setUTCFullYear(d.getUTCFullYear() + amount);
    return d;
  }
  const ms = MS_PER[u];
  if (ms === undefined) return null;
  return new Date(d.getTime() + amount * ms);
}

function diffDates(a: Date, b: Date, unit: string): number | null {
  const u = normalizeUnit(unit);
  if (u === "years") return a.getUTCFullYear() - b.getUTCFullYear();
  if (u === "months") {
    return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
  }
  const ms = MS_PER[u];
  if (ms === undefined) return null;
  return Math.trunc((a.getTime() - b.getTime()) / ms);
}

// ── Function library ─────────────────────────────────────

interface FunctionDef {
  minArgs: number;
  maxArgs: number;
  /** The static result type this function yields — the anchor for
   *  {@link inferResultType}. `if` / `coalesce` are inferred from their
   *  branch arguments instead, so their value here is only a fallback. */
  result: FormulaResultType;
  fn: (args: FormulaValue[]) => FormulaValue;
}

function numArgs(args: FormulaValue[]): number[] {
  return args.map((a) => toNumber(a) ?? NaN);
}

const FUNCTIONS: Record<string, FunctionDef> = {
  // Logic
  if: {
    minArgs: 3,
    maxArgs: 3,
    result: "TEXT", // inferred from the two branches, see inferResultType
    fn: (a) => (toBoolean(a[0] ?? null) ? (a[1] ?? null) : (a[2] ?? null)),
  },
  and: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "BOOLEAN",
    fn: (a) => a.every((x) => toBoolean(x)),
  },
  or: { minArgs: 1, maxArgs: Infinity, result: "BOOLEAN", fn: (a) => a.some((x) => toBoolean(x)) },
  not: { minArgs: 1, maxArgs: 1, result: "BOOLEAN", fn: (a) => !toBoolean(a[0] ?? null) },
  isempty: {
    minArgs: 1,
    maxArgs: 1,
    result: "BOOLEAN",
    fn: (a) => {
      const v = a[0] ?? null;
      return v === null || (typeof v === "string" && v.trim() === "");
    },
  },
  coalesce: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "TEXT", // inferred from its arguments, see inferResultType
    fn: (a) => a.find((v) => v !== null && !(typeof v === "string" && v === "")) ?? null,
  },

  // Number
  round: {
    minArgs: 1,
    maxArgs: 2,
    result: "NUMBER",
    fn: (a) => {
      const x = toNumber(a[0] ?? null);
      if (x === null) return null;
      const digits = a.length > 1 ? (toNumber(a[1] ?? null) ?? 0) : 0;
      const f = 10 ** digits;
      return Math.round(x * f) / f;
    },
  },
  floor: { minArgs: 1, maxArgs: 1, result: "NUMBER", fn: (a) => nOrNull(a[0] ?? null, Math.floor) },
  ceil: { minArgs: 1, maxArgs: 1, result: "NUMBER", fn: (a) => nOrNull(a[0] ?? null, Math.ceil) },
  abs: { minArgs: 1, maxArgs: 1, result: "NUMBER", fn: (a) => nOrNull(a[0] ?? null, Math.abs) },
  sqrt: { minArgs: 1, maxArgs: 1, result: "NUMBER", fn: (a) => nOrNull(a[0] ?? null, Math.sqrt) },
  min: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "NUMBER",
    fn: (a) => {
      const ns = numArgs(a).filter((x) => Number.isFinite(x));
      return ns.length ? Math.min(...ns) : null;
    },
  },
  max: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "NUMBER",
    fn: (a) => {
      const ns = numArgs(a).filter((x) => Number.isFinite(x));
      return ns.length ? Math.max(...ns) : null;
    },
  },
  sum: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "NUMBER",
    fn: (a) =>
      numArgs(a)
        .filter(Number.isFinite)
        .reduce((s, x) => s + x, 0),
  },
  avg: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "NUMBER",
    fn: (a) => {
      const ns = numArgs(a).filter((x) => Number.isFinite(x));
      return ns.length ? ns.reduce((s, x) => s + x, 0) / ns.length : null;
    },
  },
  mod: {
    minArgs: 2,
    maxArgs: 2,
    result: "NUMBER",
    fn: (a) => {
      const x = toNumber(a[0] ?? null);
      const y = toNumber(a[1] ?? null);
      if (x === null || y === null || y === 0) return null;
      return x % y;
    },
  },
  pow: {
    minArgs: 2,
    maxArgs: 2,
    result: "NUMBER",
    fn: (a) => {
      const x = toNumber(a[0] ?? null);
      const y = toNumber(a[1] ?? null);
      if (x === null || y === null) return null;
      const r = x ** y;
      return Number.isFinite(r) ? r : null;
    },
  },

  // String
  concat: {
    minArgs: 1,
    maxArgs: Infinity,
    result: "TEXT",
    fn: (a) => a.map(toStringValue).join(""),
  },
  upper: {
    minArgs: 1,
    maxArgs: 1,
    result: "TEXT",
    fn: (a) => toStringValue(a[0] ?? null).toUpperCase(),
  },
  lower: {
    minArgs: 1,
    maxArgs: 1,
    result: "TEXT",
    fn: (a) => toStringValue(a[0] ?? null).toLowerCase(),
  },
  trim: { minArgs: 1, maxArgs: 1, result: "TEXT", fn: (a) => toStringValue(a[0] ?? null).trim() },
  len: { minArgs: 1, maxArgs: 1, result: "NUMBER", fn: (a) => toStringValue(a[0] ?? null).length },
  contains: {
    minArgs: 2,
    maxArgs: 2,
    result: "BOOLEAN",
    fn: (a) => toStringValue(a[0] ?? null).includes(toStringValue(a[1] ?? null)),
  },
  replace: {
    minArgs: 3,
    maxArgs: 3,
    result: "TEXT",
    fn: (a) =>
      toStringValue(a[0] ?? null)
        .split(toStringValue(a[1] ?? null))
        .join(toStringValue(a[2] ?? null)),
  },
  substring: {
    minArgs: 2,
    maxArgs: 3,
    result: "TEXT",
    fn: (a) => {
      const s = toStringValue(a[0] ?? null);
      const start = toNumber(a[1] ?? null) ?? 0;
      if (a.length > 2) {
        const len = toNumber(a[2] ?? null) ?? 0;
        return s.substring(start, start + len);
      }
      return s.substring(start);
    },
  },
  left: {
    minArgs: 2,
    maxArgs: 2,
    result: "TEXT",
    fn: (a) => toStringValue(a[0] ?? null).substring(0, Math.max(0, toNumber(a[1] ?? null) ?? 0)),
  },
  right: {
    minArgs: 2,
    maxArgs: 2,
    result: "TEXT",
    fn: (a) => {
      const s = toStringValue(a[0] ?? null);
      const n = Math.max(0, toNumber(a[1] ?? null) ?? 0);
      return s.substring(Math.max(0, s.length - n));
    },
  },

  // Date
  now: { minArgs: 0, maxArgs: 0, result: "DATE", fn: () => new Date() },
  today: {
    minArgs: 0,
    maxArgs: 0,
    result: "DATE",
    fn: () => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      return d;
    },
  },
  dateadd: {
    minArgs: 3,
    maxArgs: 3,
    result: "DATE",
    fn: (a) => {
      const d = toDateValue(a[0] ?? null);
      const amt = toNumber(a[1] ?? null);
      const unit = toStringValue(a[2] ?? null);
      if (d === null || amt === null) return null;
      return shiftDate(d, amt, unit);
    },
  },
  datediff: {
    minArgs: 3,
    maxArgs: 3,
    result: "NUMBER",
    fn: (a) => {
      const x = toDateValue(a[0] ?? null);
      const y = toDateValue(a[1] ?? null);
      if (x === null || y === null) return null;
      return diffDates(x, y, toStringValue(a[2] ?? null));
    },
  },
  year: {
    minArgs: 1,
    maxArgs: 1,
    result: "NUMBER",
    fn: (a) => dateField(a[0] ?? null, (d) => d.getUTCFullYear()),
  },
  month: {
    minArgs: 1,
    maxArgs: 1,
    result: "NUMBER",
    fn: (a) => dateField(a[0] ?? null, (d) => d.getUTCMonth() + 1),
  },
  day: {
    minArgs: 1,
    maxArgs: 1,
    result: "NUMBER",
    fn: (a) => dateField(a[0] ?? null, (d) => d.getUTCDate()),
  },
  formatdate: {
    minArgs: 1,
    maxArgs: 1,
    result: "TEXT",
    fn: (a) => {
      const d = toDateValue(a[0] ?? null);
      return d === null ? null : d.toISOString().slice(0, 10);
    },
  },

  // Casts — explicit type coercion + the escape hatch for inferResultType.
  // Wrapping an expression in one of these both coerces the runtime value and
  // pins the field's result type (e.g. `tostring(price)` makes a numeric field
  // render as text). Naming is case-insensitive, so `toNumber` / `tonumber`
  // both resolve here.
  tostring: {
    minArgs: 1,
    maxArgs: 1,
    result: "TEXT",
    fn: (a) => {
      const v = a[0] ?? null;
      return v === null ? null : toStringValue(v);
    },
  },
  tonumber: { minArgs: 1, maxArgs: 1, result: "NUMBER", fn: (a) => toNumber(a[0] ?? null) },
  tobool: { minArgs: 1, maxArgs: 1, result: "BOOLEAN", fn: (a) => toBoolean(a[0] ?? null) },
  todate: { minArgs: 1, maxArgs: 1, result: "DATE", fn: (a) => toDateValue(a[0] ?? null) },
};

function nOrNull(v: FormulaValue, op: (x: number) => number): FormulaValue {
  const x = toNumber(v);
  if (x === null) return null;
  const r = op(x);
  return Number.isFinite(r) ? r : null;
}

function dateField(v: FormulaValue, op: (d: Date) => number): FormulaValue {
  const d = toDateValue(v);
  return d === null ? null : op(d);
}

/** The function names available in a formula, for help / autocomplete UI. */
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS).sort();

// ── Evaluator ────────────────────────────────────────────

function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  if (a instanceof Date || b instanceof Date) {
    const da = toDateValue(a);
    const db = toDateValue(b);
    if (da && db) return da.getTime() === db.getTime();
    return a === b;
  }
  if (typeof a === "number" || typeof b === "number") {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na !== null && nb !== null) return na === nb;
  }
  if (a === null || b === null) return a === b;
  return toStringValue(a) === toStringValue(b);
}

function compare(a: FormulaValue, b: FormulaValue): number | null {
  if (a instanceof Date || b instanceof Date) {
    const da = toDateValue(a);
    const db = toDateValue(b);
    if (da && db) return da.getTime() - db.getTime();
    return null;
  }
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return toStringValue(a).localeCompare(toStringValue(b));
}

function arith(
  op: "+" | "-" | "*" | "/" | "%",
  left: FormulaValue,
  right: FormulaValue,
): FormulaValue {
  const a = toNumber(left);
  const b = toNumber(right);
  if (a === null || b === null) return null;
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? null : a / b;
    case "%":
      return b === 0 ? null : a % b;
  }
}

function evalNode(node: FormulaNode, scope: FormulaScope): FormulaValue {
  switch (node.kind) {
    case "num":
      return node.value;
    case "str":
      return node.value;
    case "bool":
      return node.value;
    case "null":
      return null;
    case "ref":
      return normalizeScopeValue(scope[node.name]);
    case "unary": {
      const v = evalNode(node.operand, scope);
      if (node.op === "!") return !toBoolean(v);
      const n = toNumber(v);
      return n === null ? null : -n;
    }
    case "call": {
      const def = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined;
      if (!def) return null; // guarded at parse time
      return def.fn(node.args.map((arg) => evalNode(arg, scope)));
    }
    case "binary": {
      // Short-circuit logical operators.
      if (node.op === "&&")
        return toBoolean(evalNode(node.left, scope)) && toBoolean(evalNode(node.right, scope));
      if (node.op === "||")
        return toBoolean(evalNode(node.left, scope)) || toBoolean(evalNode(node.right, scope));
      const l = evalNode(node.left, scope);
      const r = evalNode(node.right, scope);
      switch (node.op) {
        case "&":
          return toStringValue(l) + toStringValue(r);
        case "==":
          return looseEquals(l, r);
        case "!=":
          return !looseEquals(l, r);
        case "<":
        case "<=":
        case ">":
        case ">=": {
          const c = compare(l, r);
          if (c === null) return false;
          return node.op === "<"
            ? c < 0
            : node.op === "<="
              ? c <= 0
              : node.op === ">"
                ? c > 0
                : c >= 0;
        }
        default:
          return arith(node.op, l, r);
      }
    }
  }
}

/**
 * Parse + evaluate an expression against a record's field values. Throws
 * {@link FormulaError} only on a syntax error ; a runtime type mismatch
 * yields `null` (formulas are total — a bad reference or divide-by-zero
 * degrades to empty, it never throws). Callers that persist the result pass
 * it through {@link coerceFormulaResult} for the field's declared type.
 */
export function evaluateFormula(expression: string, scope: FormulaScope): FormulaValue {
  return evalNode(parseFormula(expression), scope);
}

/** Non-throwing variant : returns the parse error message instead. */
export function tryEvaluateFormula(
  expression: string,
  scope: FormulaScope,
): { ok: true; value: FormulaValue } | { ok: false; error: string } {
  try {
    return { ok: true, value: evaluateFormula(expression, scope) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid formula" };
  }
}

/** Coerce a raw formula result to its field's declared output type, ready to
 *  persist into `DataRecord.data` (a Date survives as an ISO string in JSON). */
export function coerceFormulaResult(
  value: FormulaValue,
  resultType: FormulaResultType,
): FormulaValue {
  switch (resultType) {
    case "NUMBER":
      return toNumber(value);
    case "TEXT":
      return value === null ? null : toStringValue(value);
    case "BOOLEAN":
      return toBoolean(value);
    case "DATE":
      return toDateValue(value);
  }
}

/**
 * Statically infer a formula's result type from its outermost operation — no
 * scope needed, so a field's stored type is *derived* from its expression
 * rather than configured. The mapping follows what each operator / function
 * yields: comparisons + logic → BOOLEAN, arithmetic → NUMBER, `&` + text
 * functions → TEXT, date functions → DATE. Two cases can't be pinned by shape
 * alone and fall back to TEXT (the universal display type, since every value
 * coerces to text): a bare field reference (references are untyped in this
 * pure engine) and an `if` / `coalesce` whose branches disagree. The escape
 * hatch is an explicit cast — `toNumber(...)`, `toDate(...)`, etc. — whose
 * outermost position pins the type deterministically. Throws
 * {@link FormulaError} if the expression doesn't parse.
 */
export function inferResultType(expression: string | FormulaNode): FormulaResultType {
  const node = typeof expression === "string" ? parseFormula(expression) : expression;
  return inferNode(node);
}

function inferNode(node: FormulaNode): FormulaResultType {
  switch (node.kind) {
    case "num":
      return "NUMBER";
    case "str":
      return "TEXT";
    case "bool":
      return "BOOLEAN";
    case "null":
      return "TEXT";
    case "ref":
      return "TEXT"; // references are untyped here; text is the safe scalar view
    case "unary":
      return node.op === "!" ? "BOOLEAN" : "NUMBER";
    case "binary":
      switch (node.op) {
        case "&":
          return "TEXT";
        case "==":
        case "!=":
        case "<":
        case "<=":
        case ">":
        case ">=":
        case "&&":
        case "||":
          return "BOOLEAN";
        default:
          return "NUMBER"; // + - * / %
      }
    case "call": {
      // `if` / `coalesce` reflect their branches: if the candidate values all
      // infer to the same type, use it; otherwise fall back to TEXT.
      if (node.name === "if") {
        const branches = [node.args[1], node.args[2]].filter(Boolean) as FormulaNode[];
        return unifyTypes(branches.map(inferNode));
      }
      if (node.name === "coalesce") {
        return unifyTypes(node.args.map(inferNode));
      }
      return (
        (Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined)?.result ?? "TEXT"
      );
    }
  }
}

/** The single type a set of branch types agree on, or TEXT if they don't. */
function unifyTypes(types: FormulaResultType[]): FormulaResultType {
  const first = types[0];
  if (first === undefined) return "TEXT";
  return types.every((t) => t === first) ? first : "TEXT";
}

/**
 * The field keys an expression references (bare identifiers that aren't
 * function calls or keyword literals). Used to validate references against a
 * model's fields and to build the formula dependency graph for cycle
 * detection. Throws {@link FormulaError} if the expression doesn't parse.
 */
export function extractFieldRefs(expression: string): string[] {
  const refs = new Set<string>();
  const walk = (node: FormulaNode): void => {
    switch (node.kind) {
      case "ref":
        refs.add(node.name);
        return;
      case "unary":
        walk(node.operand);
        return;
      case "call":
        node.args.forEach(walk);
        return;
      case "binary":
        walk(node.left);
        walk(node.right);
        return;
      default:
        return;
    }
  };
  walk(parseFormula(expression));
  return [...refs];
}
