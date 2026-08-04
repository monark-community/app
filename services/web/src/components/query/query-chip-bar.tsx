"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Type } from "lucide-react";
import {
  defaultOpForKind,
  fieldKindsFrom,
  group as makeGroup,
  isQueryVariable,
  leaf as makeLeaf,
  legalOps,
  opValueArity,
  parseQuery,
  printQuery,
  QuerySyntaxError,
  type FilterableKind,
  type FilterLeaf,
  type FilterNode,
  type FilterOp,
} from "@monark/query/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ChipList } from "@/components/ui/chip";
import { MultiSelect, type MultiSelectOption } from "@/components/patterns";
import { QueryBar, type QueryBarLabels, type QueryFieldMeta } from "./query-bar";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The **chip / token** query editor (MonarkQL). A tree-backed sibling of
 * {@link QueryBar} : it reads the same controlled `text` (the canonical
 * serialization the parent owns, so saved views + deep links keep working), but
 * renders each predicate as a removable **chip** whose value resolves to a human
 * label — `Assignee: Ada Lovelace`, `Priority ≥ High` — instead of a raw id, and
 * lets the user add/edit predicates through a guided popover where the operator
 * is **picked from a menu** (never typed, so `>= <=` stop being awkward).
 *
 * Drop-in with {@link QueryBar} : identical props. It chips a flat AND of leaves
 * (the overwhelmingly common shape) ; an OR / nested / negated-text query it
 * can't represent as chips falls back to the embedded text bar, which is also
 * reachable any time via the "edit as text" toggle. Presentational + tRPC-free ;
 * operator / chip strings come from the shared `query` i18n namespace.
 */
export function QueryChipBar({
  fields,
  text,
  onTextChange,
  onChange,
  labels,
  describeOp,
  describeVariable,
  className,
}: {
  fields: QueryFieldMeta[];
  /** Controlled query text (owned by the parent — the single source of truth). */
  text: string;
  onTextChange: (text: string) => void;
  onChange: (tree: FilterNode | null) => void;
  labels: QueryBarLabels;
  /** Localized autocomplete hints forwarded to the text-mode {@link QueryBar}
   *  (build with `useMqlLabels()`). Chip operator labels use the same `query`
   *  namespace directly. */
  describeOp?: (op: FilterOp) => string;
  describeVariable?: (token: string) => string;
  className?: string;
}) {
  const tq = useTranslations("query");
  const [forceText, setForceText] = useState(false);

  const kinds = useMemo(
    () => fieldKindsFrom(fields.map((f) => ({ key: f.key, kind: f.kind }))),
    [fields],
  );
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  // Parse the controlled text to a tree, then to a flat leaf list if the shape
  // allows. `null` leaves = an unchippable query (OR / nesting / parse error),
  // which forces the text bar.
  const leaves = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    try {
      return extractLeaves(parseQuery(trimmed, kinds));
    } catch (e) {
      if (e instanceof QuerySyntaxError) return null;
      throw e;
    }
  }, [text, kinds]);

  const opLabel = (op: FilterOp) => tq(`op.${op}`);

  function emit(next: FilterLeaf[]) {
    const tree = leavesToTree(next);
    onChange(tree);
    onTextChange(tree ? printQuery(tree, kinds) : "");
  }

  // Text mode : the query is too complex to chip, or the user asked for it.
  const showText = forceText || leaves === null;

  if (showText) {
    return (
      <div className={cn("flex w-full items-start gap-1.5", className)}>
        <QueryBar
          fields={fields}
          text={text}
          onTextChange={onTextChange}
          onChange={onChange}
          labels={labels}
          describeOp={describeOp}
          describeVariable={describeVariable}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={tq("chip.chipMode")}
          title={tq("chip.chipMode")}
          // Only offer a return to chips when the current text is chippable.
          disabled={leaves === null}
          onClick={() => setForceText(false)}
          className="h-9 shrink-0"
        >
          <Type className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <ChipList className="min-h-9 max-md:min-h-11">
        {leaves.map((leaf, i) => {
          const field = fieldByKey.get(leaf.field);
          if (!field) return null;
          return (
            <QueryChipToken
              key={`${leaf.field}-${i}`}
              fields={fields}
              field={field}
              leaf={leaf}
              opLabel={opLabel}
              onApply={(next) => emit(leaves.map((l, j) => (j === i ? next : l)))}
              onRemove={() => emit(leaves.filter((_, j) => j !== i))}
            />
          );
        })}
        <AddFilterToken
          fields={fields}
          opLabel={opLabel}
          onAdd={(next) => emit([...leaves, next])}
        />
        <button
          type="button"
          aria-label={tq("chip.textMode")}
          title={tq("chip.textMode")}
          onClick={() => setForceText(true)}
          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Type className="h-4 w-4" aria-hidden />
        </button>
      </ChipList>
    </div>
  );
}

// ── one chip (view + inline edit popover) ────────────────

function QueryChipToken({
  fields,
  field,
  leaf,
  opLabel,
  onApply,
  onRemove,
}: {
  fields: QueryFieldMeta[];
  field: QueryFieldMeta;
  leaf: FilterLeaf;
  opLabel: (op: FilterOp) => string;
  onApply: (leaf: FilterLeaf) => void;
  onRemove: () => void;
}) {
  const tq = useTranslations("query");
  const [open, setOpen] = useState(false);

  return (
    <Badge variant="secondary" className="max-w-full gap-1 pl-2 pr-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="truncate rounded-sm text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {describeChip(leaf, field, opLabel)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <LeafEditor
            fields={fields}
            initialField={field}
            initialLeaf={leaf}
            opLabel={opLabel}
            onApply={(next) => {
              onApply(next);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={onRemove}
        aria-label={tq("chip.remove", { field: field.label })}
        className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-foreground/10"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </Badge>
  );
}

// ── add-filter affordance ────────────────────────────────

function AddFilterToken({
  fields,
  opLabel,
  onAdd,
}: {
  fields: QueryFieldMeta[];
  opLabel: (op: FilterOp) => string;
  onAdd: (leaf: FilterLeaf) => void;
}) {
  const tq = useTranslations("query");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors",
            "hover:border-foreground/40 hover:text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <Plus className="h-3 w-3" aria-hidden />
          {tq("chip.add")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <LeafEditor
          fields={fields}
          opLabel={opLabel}
          onApply={(next) => {
            onAdd(next);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ── the field → operator → value editor ──────────────────

function LeafEditor({
  fields,
  initialField,
  initialLeaf,
  opLabel,
  onApply,
  onCancel,
}: {
  fields: QueryFieldMeta[];
  initialField?: QueryFieldMeta;
  initialLeaf?: FilterLeaf;
  opLabel: (op: FilterOp) => string;
  onApply: (leaf: FilterLeaf) => void;
  onCancel: () => void;
}) {
  const tq = useTranslations("query");
  const [field, setField] = useState<QueryFieldMeta | null>(initialField ?? null);
  const [op, setOp] = useState<FilterOp>(
    initialLeaf?.op ?? (initialField ? defaultOpForKind(initialField.kind) : "is"),
  );
  const [raw, setRaw] = useState<string[]>(() => valuesToRaw(initialLeaf?.value));

  // Field-picker stage (only when adding and no field chosen yet).
  if (!field) {
    return (
      <div className="space-y-1">
        <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">{tq("chip.field")}</p>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {fields.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => {
                  setField(f);
                  const nextOp = defaultOpForKind(f.kind);
                  setOp(nextOp);
                  setRaw(seedRaw(nextOp, []));
                }}
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const ops = legalOps(field.kind);
  const complete = isComplete(op, raw);

  function changeOp(next: FilterOp) {
    setOp(next);
    setRaw(seedRaw(next, raw));
  }

  return (
    <div className="space-y-2.5">
      <p className="px-0.5 text-sm font-medium">{field.label}</p>

      {/* Operator — always picked from the legal set, so symbols are never typed. */}
      <div className="space-y-1">
        <label className="px-0.5 text-xs font-medium text-muted-foreground">
          {tq("chip.operator")}
        </label>
        <Select value={op} onValueChange={(v) => changeOp(v as FilterOp)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map((o) => (
              <SelectItem key={o} value={o}>
                {opLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value — shape follows the operator's arity + the field's kind. */}
      <ValueEditor field={field} op={op} raw={raw} setRaw={setRaw} />

      <div className="flex justify-end gap-2 pt-0.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tq("chip.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!complete}
          onClick={() => onApply(buildLeaf(field, op, raw))}
        >
          {tq("chip.apply")}
        </Button>
      </div>
    </div>
  );
}

function ValueEditor({
  field,
  op,
  raw,
  setRaw,
}: {
  field: QueryFieldMeta;
  op: FilterOp;
  raw: string[];
  setRaw: (next: string[]) => void;
}) {
  const tq = useTranslations("query");
  const arity = opValueArity(op);
  if (arity === "none") return null;

  const options = field.options ?? [];
  const msLabels = {
    placeholder: tq("chip.valuePlaceholder"),
    add: tq("chip.addValue"),
    remove: (l: string) => tq("chip.remove", { field: l }),
    noResults: tq("chip.noResults"),
  };
  const dateLabels = { placeholder: tq("chip.pickDate"), clearLabel: tq("chip.clearDate") };

  // List membership over a fixed option set (select / multiSelect / orderedSelect).
  if (arity === "list") {
    const msOptions: MultiSelectOption[] = [
      ...(field.userValued ? [{ value: "@me", label: "@me" }] : []),
      ...options.map((o) => ({ value: o.value, label: o.label })),
    ];
    return <MultiSelect value={raw} onChange={setRaw} options={msOptions} labels={msLabels} />;
  }

  // A pair (between) — two scalars of the field's kind.
  if (arity === "pair") {
    return (
      <div className="flex items-center gap-2">
        <ScalarInput
          field={field}
          value={raw[0] ?? ""}
          onChange={(v) => setRaw([v, raw[1] ?? ""])}
          dateLabels={dateLabels}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <ScalarInput
          field={field}
          value={raw[1] ?? ""}
          onChange={(v) => setRaw([raw[0] ?? "", v])}
          dateLabels={dateLabels}
        />
      </div>
    );
  }

  // Scalar — one value editor keyed by kind. A fixed-set field with a comparison
  // op (orderedSelect `>= HIGH`) picks a single option.
  if (options.length > 0) {
    return (
      <Select value={raw[0] ?? ""} onValueChange={(v) => setRaw([v])}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder={tq("chip.valuePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <ScalarInput
      field={field}
      value={raw[0] ?? ""}
      onChange={(v) => setRaw([v])}
      dateLabels={dateLabels}
    />
  );
}

function ScalarInput({
  field,
  value,
  onChange,
  dateLabels,
}: {
  field: QueryFieldMeta;
  value: string;
  onChange: (v: string) => void;
  dateLabels: { placeholder: string; clearLabel: string };
}) {
  if (field.kind === "date") {
    const parsed = value && !isQueryVariable(value) ? new Date(value) : null;
    return (
      <DatePicker
        value={parsed && !Number.isNaN(parsed.getTime()) ? parsed : null}
        onChange={(d) => onChange(d ? d.toISOString() : "")}
        placeholder={dateLabels.placeholder}
        clearLabel={dateLabels.clearLabel}
        className="flex-1"
      />
    );
  }
  return (
    <Input
      type={field.kind === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8"
      autoFocus
    />
  );
}

// ── pure helpers ─────────────────────────────────────────

/** A tree the chip editor can represent : `null`, a single leaf, or a flat,
 *  non-negated AND of leaves. Anything else (OR, nesting, a negated group such
 *  as `-title:foo`) returns `null` → the text bar. */
function extractLeaves(tree: FilterNode | null): FilterLeaf[] | null {
  if (tree === null) return [];
  if (tree.kind === "leaf") return [tree];
  if (tree.combinator === "and" && !tree.negate) {
    const out: FilterLeaf[] = [];
    for (const child of tree.children) {
      if (child.kind !== "leaf") return null;
      out.push(child);
    }
    return out;
  }
  return null;
}

function leavesToTree(leaves: FilterLeaf[]): FilterNode | null {
  if (leaves.length === 0) return null;
  if (leaves.length === 1) return leaves[0]!;
  return makeGroup("and", leaves);
}

function valuesToRaw(value: FilterLeaf["value"]): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Reshape the working values when the operator's arity changes, preserving what
 *  carries over. */
function seedRaw(op: FilterOp, prev: string[]): string[] {
  switch (opValueArity(op)) {
    case "none":
      return [];
    case "scalar":
      return [prev[0] ?? ""];
    case "pair":
      return [prev[0] ?? "", prev[1] ?? ""];
    case "list":
      return prev.filter((v) => v.trim() !== "");
  }
}

function isComplete(op: FilterOp, raw: string[]): boolean {
  switch (opValueArity(op)) {
    case "none":
      return true;
    case "scalar":
      return (raw[0] ?? "").trim() !== "";
    case "pair":
      return (raw[0] ?? "").trim() !== "" && (raw[1] ?? "").trim() !== "";
    case "list":
      return raw.some((v) => v.trim() !== "");
  }
}

function buildLeaf(field: QueryFieldMeta, op: FilterOp, raw: string[]): FilterLeaf {
  switch (opValueArity(op)) {
    case "none":
      return makeLeaf(field.key, op);
    case "scalar":
      return makeLeaf(field.key, op, raw[0] ?? "");
    case "pair":
      return makeLeaf(field.key, op, [raw[0] ?? "", raw[1] ?? ""]);
    case "list":
      return makeLeaf(
        field.key,
        op,
        raw.filter((v) => v.trim() !== ""),
      );
  }
}

/** Resolve one stored value to a display label : an `@variable` shows its token,
 *  a fixed-set value resolves through the field's options (id → name), a date is
 *  formatted, everything else is literal. */
function valueLabel(field: QueryFieldMeta, v: string): string {
  if (isQueryVariable(v)) return v;
  const opt = field.options?.find((o) => o.value === v);
  if (opt) return opt.label;
  if (field.kind === "date") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return v;
}

// A compact, language-neutral connector between a field and its value for the
// chip label ; `null` means "use the operator's word instead".
function chipConnector(op: FilterOp, kind: FilterableKind): string | null {
  if (op === defaultOpForKind(kind)) return ":";
  switch (op) {
    case "isNoneOf":
    case "hasNoneOf":
    case "isNot":
    case "neq":
      return "≠";
    case "gt":
    case "after":
      return ">";
    case "gte":
    case "onOrAfter":
      return "≥";
    case "lt":
    case "before":
      return "<";
    case "lte":
    case "onOrBefore":
      return "≤";
    default:
      return null;
  }
}

function describeChip(
  leaf: FilterLeaf,
  field: QueryFieldMeta,
  opLabel: (op: FilterOp) => string,
): string {
  const values = valuesToRaw(leaf.value).map((v) => valueLabel(field, v));
  if (opValueArity(leaf.op) === "none") return `${field.label} · ${opLabel(leaf.op)}`;
  if (leaf.op === "between") return `${field.label}: ${values[0] ?? ""} – ${values[1] ?? ""}`;

  const connector = chipConnector(leaf.op, field.kind);
  const joined = values.join(", ");
  if (connector === ":") return `${field.label}: ${joined}`;
  if (connector) return `${field.label} ${connector} ${joined}`;
  return `${field.label} ${opLabel(leaf.op)} ${joined}`;
}
