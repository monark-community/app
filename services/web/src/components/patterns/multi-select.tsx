"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AddChip, Chip, ChipList, type ChipTone } from "@/components/ui/chip";

export interface MultiSelectOption {
  value: string;
  label: ReactNode;
  tone?: ChipTone;
  /**
   * Content rendered at the start of the selected chip (and the dropdown row) —
   * e.g. a small avatar or colour dot. Passed through to the {@link Chip}'s
   * `leading` slot.
   */
  leading?: ReactNode;
  /** Text the typeahead matches against ; defaults to a string `label`. */
  searchText?: string;
  /** When set, the selected chip's label links here (the dropdown row stays plain). */
  href?: string;
  /** Open the chip's link in a new tab (avoids discarding an unsaved form). */
  hrefNewTab?: boolean;
}

export interface MultiSelectLabels {
  /** Placeholder inside the input when empty. */
  placeholder: string;
  /** Text on the dashed "add" chip shown in the empty state. */
  add: string;
  /** aria-label for a chip's remove button. */
  remove: (label: string) => string;
  /** Shown in the options dropdown when the query matches nothing. */
  noResults?: string;
  /** Label for the "create new value" row (custom mode). */
  create?: (value: string) => string;
}

type Item = { kind: "option"; option: MultiSelectOption } | { kind: "create"; value: string };

/**
 * Controlled multi-value input : a box of removable {@link Chip}s plus an
 * inline typeahead. Two shapes from one component :
 *
 *  - **Options** (`options` set) — typing filters a dropdown of choices ;
 *    Enter / click adds the highlighted one (the industries picker).
 *  - **Tags** (`allowCustom`, usually no `options`) — typing + Enter (or a
 *    comma) creates a chip from the typed value, normalized by
 *    `normalizeCustom` (the keywords input).
 *
 * Backspace on an empty input removes the last chip. Empty + unfocused shows
 * the dashed {@link AddChip}. Built on the shared `Chip` / `AddChip` /
 * `ChipList`. Text-free : pass already-translated `labels`.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  allowCustom = false,
  normalizeCustom,
  max,
  disabled = false,
  labels,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options?: MultiSelectOption[];
  allowCustom?: boolean;
  /** Normalize a typed custom value ; return `null` to reject it. */
  normalizeCustom?: (raw: string) => string | null;
  max?: number;
  disabled?: boolean;
  labels: MultiSelectLabels;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const hasOptions = !!options;
  const optionByValue = useMemo(() => new Map((options ?? []).map((o) => [o.value, o])), [options]);
  const labelFor = (v: string): ReactNode => optionByValue.get(v)?.label ?? v;
  const strLabelFor = (v: string): string => {
    const o = optionByValue.get(v);
    if (!o) return v;
    if (typeof o.label === "string") return o.label;
    return o.searchText ?? v;
  };
  const toneFor = (v: string): ChipTone | undefined => optionByValue.get(v)?.tone;
  const leadingFor = (v: string): ReactNode => optionByValue.get(v)?.leading;
  const hrefFor = (v: string): string | undefined => optionByValue.get(v)?.href;
  const hrefNewTabFor = (v: string): boolean | undefined => optionByValue.get(v)?.hrefNewTab;

  const atMax = max != null && value.length >= max;
  const query = input.trim();

  const filtered = useMemo(() => {
    if (!options) return [];
    const q = query.toLowerCase();
    return options.filter((o) => {
      if (value.includes(o.value)) return false;
      if (q === "") return true;
      const hay = (o.searchText ?? (typeof o.label === "string" ? o.label : o.value)).toLowerCase();
      return hay.includes(q);
    });
  }, [options, value, query]);

  const normalized =
    allowCustom && query ? (normalizeCustom ? normalizeCustom(query) : query) : null;
  const canCreate =
    !!normalized &&
    !value.includes(normalized) &&
    !filtered.some((o) => o.value === normalized) &&
    !atMax;

  const items = useMemo<Item[]>(() => {
    if (!hasOptions) return [];
    const opts: Item[] = filtered.map((o) => ({ kind: "option", option: o }));
    return canCreate && normalized ? [...opts, { kind: "create", value: normalized }] : opts;
  }, [hasOptions, filtered, canCreate, normalized]);

  const showDropdown =
    focused &&
    !disabled &&
    hasOptions &&
    (items.length > 0 || (query !== "" && !!labels.noResults));

  const showAddChip = value.length === 0 && !focused && input === "";

  function add(v: string) {
    if (!v || value.includes(v) || atMax) return;
    onChange([...value, v]);
    setInput("");
    setActiveIndex(0);
  }
  function removeValue(v: string) {
    onChange(value.filter((x) => x !== v));
  }
  function commitItem(it: Item) {
    add(it.kind === "option" ? it.option.value : it.value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (showDropdown && items.length > 0) {
        e.preventDefault();
        commitItem(items[activeIndex] ?? items[0]!);
      } else if (canCreate && normalized) {
        e.preventDefault();
        add(normalized);
      }
    } else if (e.key === "," && allowCustom) {
      e.preventDefault();
      if (normalized) add(normalized);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      const last = value[value.length - 1];
      if (last) removeValue(last);
    } else if (e.key === "ArrowDown" && items.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp" && items.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setInput("");
    }
  }

  return (
    <div className="relative">
      <ChipList className={cn(disabled && "opacity-60")}>
        {value.map((v) => (
          <Chip
            key={v}
            label={labelFor(v)}
            leading={leadingFor(v)}
            href={hrefFor(v)}
            hrefNewTab={hrefNewTabFor(v)}
            tone={toneFor(v)}
            disabled={disabled}
            onRemove={() => removeValue(v)}
            removeLabel={labels.remove(strLabelFor(v))}
          />
        ))}
        {showAddChip && !disabled && (
          <AddChip
            label={labels.add}
            onClick={() => {
              setFocused(true);
              inputRef.current?.focus();
            }}
          />
        )}
        <input
          ref={inputRef}
          id={id}
          value={input}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => {
            setInput(e.target.value);
            setActiveIndex(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 && !showAddChip ? labels.placeholder : ""}
          className={cn(
            "min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground",
            showAddChip && "sr-only",
          )}
        />
      </ChipList>

      {showDropdown && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {items.length === 0 && query !== "" && labels.noResults && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{labels.noResults}</p>
          )}
          {items.map((it, i) => {
            const active = i === activeIndex;
            const key = it.kind === "option" ? it.option.value : `__create_${it.value}`;
            const content =
              it.kind === "option" ? it.option.label : (labels.create?.(it.value) ?? it.value);
            return (
              <button
                key={key}
                type="button"
                // onMouseDown (not onClick) so the input's blur doesn't fire
                // first and tear down the dropdown before selection.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitItem(it);
                  inputRef.current?.focus();
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent",
                )}
              >
                {it.kind === "option" && it.option.leading}
                <span className="min-w-0 flex-1 truncate">{content}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
