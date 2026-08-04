"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  fieldKindsFrom,
  getCompletions,
  parseQuery,
  QuerySyntaxError,
  type Completion,
  type CompletionField,
  type FilterableKind,
  type FilterNode,
  type FilterOp,
} from "@monark/query/contracts";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Field metadata the bar needs : identity, the resolved filter {@link
 *  FilterableKind}, and the value options to suggest for select-like fields.
 *  Schema-agnostic — each consumer (data-models records, kanban cards, …) maps
 *  its own field types to a `kind` before feeding the bar. Structurally a
 *  {@link CompletionField}. */
export type QueryFieldMeta = {
  key: string;
  label: string;
  kind: FilterableKind;
  options?: { value: string; label: string }[];
  /** The field's values are org-member user ids (assignees, reviewers) — offer
   *  the `@me` variable in autocomplete even though the kind is multi-select. */
  userValued?: boolean;
};

export type QueryBarLabels = {
  placeholder: string;
  /** Formats a parse error for display (the raw message is appended). */
  invalid: string;
  fieldsHeading: string;
  valuesHeading: string;
  /** Short syntax reminder shown when the input is empty + focused. */
  hint: string;
};

/**
 * The text query bar (MonarkQL). A controlled input that parses its text to a
 * {@link FilterNode} tree on the fly (pushing `onChange` only on a valid, or
 * empty, query) and offers **caret-aware** autocomplete via `@monark/query`'s
 * `getCompletions` — fields, operators, values, `@variables`, and boolean
 * keywords, each with a precise replace range. The tree is the source of truth
 * the list runs ; this is one of its two editors (the other is the classic
 * filter menu). Presentational + tRPC-free : any surface with a
 * {@link QueryFieldMeta}[] can reuse it.
 */
export function QueryBar({
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
  /** Controlled query text (owned by the parent so a picked saved view can set it). */
  text: string;
  onTextChange: (text: string) => void;
  onChange: (tree: FilterNode | null) => void;
  labels: QueryBarLabels;
  /** Optional localized hints for the autocomplete `detail` (operator meanings,
   *  variable descriptions). Build with `useMqlLabels()`. English otherwise. */
  describeOp?: (op: FilterOp) => string;
  describeVariable?: (token: string) => string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const kinds = useMemo(
    () => fieldKindsFrom(fields.map((f) => ({ key: f.key, kind: f.kind }))),
    [fields],
  );

  // Parse (debounced) and push the tree up ; empty clears, invalid keeps the
  // last valid tree and surfaces the message.
  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError(null);
        onChange(null);
        return;
      }
      try {
        const tree = parseQuery(trimmed, kinds);
        setError(null);
        onChange(tree);
      } catch (e) {
        setError(e instanceof QuerySyntaxError ? e.message : String(e));
      }
    }, 350);
    return () => clearTimeout(handle);
    // Re-run on text/kinds ; onChange is a stable setter from the caller.
  }, [text, kinds, onChange]);

  // `fields` is already a CompletionField[] (key/label/kind/options/userValued).
  const completions = useMemo(
    () =>
      getCompletions(text, caret, fields as CompletionField[], { describeOp, describeVariable }),
    [text, caret, fields, describeOp, describeVariable],
  );

  const heading = completions[0]?.kind === "field" ? labels.fieldsHeading : labels.valuesHeading;

  // Hold the error styling while the suggestions are open — an incomplete query
  // ("status:") is "invalid" mid-compose, but flagging it then is jarring.
  const showError = error !== null && !open;

  useEffect(() => {
    setOpen(focused && completions.length > 0);
  }, [focused, completions.length]);

  // Reset the keyboard cursor to the top whenever the suggestion list changes.
  useEffect(() => setActiveIndex(0), [completions]);

  // Keep the active suggestion scrolled into view as it moves.
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? text.length);
  }

  function apply(c: Completion) {
    // A committed value / variable / keyword gets a trailing space so the next
    // predicate can be typed ; a field or operator leaves the caret in place to
    // keep composing the same predicate.
    const suffix = c.kind === "value" || c.kind === "variable" ? " " : "";
    const insert = c.insertText + suffix;
    const next = text.slice(0, c.replaceStart) + insert + text.slice(c.replaceEnd);
    const nextCaret = c.replaceStart + insert.length;
    onTextChange(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      }
      setCaret(nextCaret);
    });
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              onTextChange(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={syncCaret}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onFocus={() => {
              setFocused(true);
              syncCaret();
            }}
            onBlur={() => {
              // Delay so a suggestion click lands before the popover closes.
              window.setTimeout(() => setFocused(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (!open || completions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % completions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => (i - 1 + completions.length) % completions.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                const c = completions[activeIndex] ?? completions[0];
                if (c) {
                  e.preventDefault();
                  apply(c);
                }
              }
            }}
            placeholder={labels.placeholder}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? `${listId}-opt-${activeIndex}` : undefined}
            aria-invalid={showError ? true : undefined}
            className={cn(
              "font-mono h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm outline-none max-md:min-h-11 pointer-coarse:min-h-11",
              "placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
              showError ? "border-destructive focus-visible:ring-destructive" : "border-input",
            )}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-[min(28rem,90vw)] p-1"
        >
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{heading}</p>
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {completions.map((c, i) => {
              const active = i === activeIndex;
              return (
                <li key={`${c.kind}-${c.insertText}-${i}`}>
                  <button
                    type="button"
                    ref={active ? activeRef : undefined}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={active}
                    // onMouseDown (not onClick) so it fires before the input blur.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      apply(c);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm",
                      active ? "bg-accent" : "hover:bg-accent",
                    )}
                  >
                    <span className="font-mono">{c.label}</span>
                    {c.detail && (
                      <span className="truncate text-xs text-muted-foreground">{c.detail}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
      {showError ? (
        <p className="mt-1 text-xs text-destructive">
          {labels.invalid} {error}
        </p>
      ) : focused && !text ? (
        <p className="mt-1 text-xs text-muted-foreground">{labels.hint}</p>
      ) : null}
    </div>
  );
}
