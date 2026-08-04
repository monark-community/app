"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "../lib/cn";

/**
 * A text field whose `{{ … }}` tokens render as atomic, styled **chips** while
 * the rest stays free-editable text — the "variable chip input". The value is a
 * plain string (e.g. `"Hi {{ trigger.name }}!"`), so it drops in anywhere a
 * string field lives; the chips are a presentation layer over that string.
 *
 * It's a `contentEditable` surface kept *uncontrolled* for typing (React never
 * re-renders it mid-keystroke, which would drop the caret): edits serialize back
 * out through `onChange`, and the DOM is only rebuilt from `value` when `value`
 * changes from the outside (a picker insert, a parent reset). A chip is a single
 * unit — Backspace/Delete at its edge removes the whole token, and a picker can
 * drop one at the caret via the handle passed to `onFocusRegister`.
 *
 * Generic on purpose (no automation coupling): `resolveToken` turns a raw token
 * into its chip label + validity, so a caller maps `{{ steps.find.id }}` to a
 * friendly "find.id" and flags an unknown reference. Passing `suggestions` turns
 * on an inline autocomplete: typing `{{` opens a menu (grouped by source) that
 * filters as you type, and choosing a row inserts its token as a chip.
 */

/** A raw `{{ … }}` token resolved to how its chip should read. */
export interface ResolvedVariableToken {
  /** Text shown inside the chip (defaults to the raw token when unresolved). */
  label: string;
  /** Render as an error chip — e.g. a reference to a node that no longer exists. */
  invalid?: boolean;
  /** Native tooltip on the chip (e.g. the full raw token behind a short label). */
  title?: string;
}

/** Imperative handle a focused input hands out so a picker can insert at the caret. */
export interface VariableInputHandle {
  insertToken: (rawToken: string) => void;
}

/** One entry the inline autocomplete can offer (typing `{{` opens the menu). */
export interface VariableSuggestion {
  /** The `{{ … }}` token inserted (as a chip) when this row is chosen. */
  token: string;
  /** Primary label, e.g. the field name "id". */
  label: string;
  /** Source grouping shown as a header, e.g. the step name or "Trigger". */
  group?: string;
  /** Secondary hint at the row's end, e.g. the value's type. */
  hint?: string;
}

export interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Map a raw token (`"{{ trigger.name }}"`) to its chip label + state. */
  resolveToken?: (rawToken: string) => ResolvedVariableToken;
  placeholder?: string;
  disabled?: boolean;
  /** Allow newlines (a message body) vs. a single-line field (default). */
  multiline?: boolean;
  className?: string;
  "aria-label"?: string;
  /**
   * Called on focus with a handle (and on blur with `null`), so a variable
   * picker elsewhere can insert a token into whichever field is active.
   */
  onFocusRegister?: (handle: VariableInputHandle | null) => void;
  /**
   * The variables to offer in the inline autocomplete. Typing `{{` opens a menu
   * (grouped by `group`) filtered by what follows ; choosing one inserts its
   * `token` as a chip. Omit / empty to disable the menu.
   */
  suggestions?: VariableSuggestion[];
}

type Segment = { type: "text"; text: string } | { type: "token"; raw: string };

// A token is the shortest `{{ … }}` span. `.` excludes newlines, so a token
// never straddles a line — a stray unclosed `{{` just stays literal text.
const TOKEN_RE = /\{\{.*?\}\}/g;

/** Split a value string into its literal-text and `{{ token }}` segments. */
export function tokenizeValue(value: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of value.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: "text", text: value.slice(last, start) });
    segments.push({ type: "token", raw: match[0] });
    last = start + match[0].length;
  }
  if (last < value.length) segments.push({ type: "text", text: value.slice(last) });
  return segments;
}

const CHIP_ATTR = "data-variable-token";

function chipClassName(invalid: boolean | undefined): string {
  return cn(
    "mx-px inline-block select-none rounded px-1 align-baseline text-[0.85em] font-medium leading-normal",
    invalid ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
  );
}

/** Build a chip `<span>` (contentEditable=false so it acts as one unit). */
function makeChip(
  raw: string,
  resolve: VariableInputProps["resolveToken"],
  doc: Document,
): HTMLSpanElement {
  const span = doc.createElement("span");
  span.setAttribute(CHIP_ATTR, raw);
  span.contentEditable = "false";
  const resolved = resolve?.(raw) ?? { label: raw };
  span.textContent = resolved.label;
  span.className = chipClassName(resolved.invalid);
  span.title = resolved.title ?? raw;
  return span;
}

/** Replace the editor's DOM with chips + text nodes rebuilt from `value`. */
function renderInto(
  root: HTMLElement,
  value: string,
  resolve: VariableInputProps["resolveToken"],
): void {
  const doc = root.ownerDocument;
  root.textContent = "";
  for (const seg of tokenizeValue(value)) {
    if (seg.type === "text") root.appendChild(doc.createTextNode(seg.text));
    else root.appendChild(makeChip(seg.raw, resolve, doc));
  }
}

/**
 * Serialize the editor DOM back to its value string : text nodes verbatim, a
 * chip as its stored raw token, a `<br>` / block element as a newline. Exact
 * round-trip with {@link renderInto} for well-formed content.
 */
export function serializeEditor(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const token = el.getAttribute(CHIP_ATTR);
        if (token != null) {
          out += token;
        } else if (el.tagName === "BR") {
          out += "\n";
        } else {
          // A block wrapper the browser may insert on Enter/paste — treat its
          // boundary as a newline, then recurse into it.
          if (out.length > 0 && !out.endsWith("\n")) out += "\n";
          walk(el);
        }
      }
    });
  };
  walk(root);
  return out;
}

/** The text node immediately before the collapsed caret, if the char before is deletable text. */
function chipAdjacentToCaret(root: HTMLElement, direction: "back" | "forward"): HTMLElement | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const { startContainer, startOffset } = range;
  // Caret sits directly at a boundary between nodes (offset points at a child index).
  if (startContainer === root) {
    const idx = direction === "back" ? startOffset - 1 : startOffset;
    const node = root.childNodes[idx];
    return node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR) ? node : null;
  }
  // Caret inside a text node : only atomic-delete when at that node's very edge.
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const atEdge =
      direction === "back" ? startOffset === 0 : startOffset === startContainer.textContent?.length;
    if (!atEdge) return null;
    const sibling =
      direction === "back" ? startContainer.previousSibling : startContainer.nextSibling;
    return sibling instanceof HTMLElement && sibling.hasAttribute(CHIP_ATTR) ? sibling : null;
  }
  return null;
}

/** The in-progress `{{ …` the caret sits inside — what the autocomplete acts on. */
export interface ActiveQuery {
  /** The text typed after `{{` (leading space trimmed), the menu filter. */
  query: string;
  /** The text node holding the draft. */
  textNode: Text;
  /** Index of the opening `{{` within that text node. */
  start: number;
  /** The caret offset (end of the draft) within that text node. */
  end: number;
}

/**
 * The unclosed `{{ …` the collapsed caret is currently inside, or null. Drives
 * whether the suggestion menu is open, how it filters, and (on accept) which span
 * to replace with a chip. Scoped to `root`.
 */
export function activeQueryAt(root: HTMLElement): ActiveQuery | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const { startContainer, startOffset } = sel.getRangeAt(0);
  if (startContainer.nodeType !== Node.TEXT_NODE || !root.contains(startContainer)) return null;
  const textNode = startContainer as Text;
  const before = (textNode.textContent ?? "").slice(0, startOffset);
  const open = before.lastIndexOf("{{");
  if (open < 0) return null;
  const draft = before.slice(open + 2);
  // A `}}` before the caret means the token is already closed ; an over-long
  // draft is almost certainly not a real reference-in-progress.
  if (draft.includes("}}") || draft.length > 40) return null;
  return { query: draft.replace(/^\s+/, ""), textNode, start: open, end: startOffset };
}

/** Suggestions matching `query` (substring over group + label + token), best first, capped. */
export function filterSuggestions(
  all: VariableSuggestion[],
  query: string,
  limit = 50,
): VariableSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q === "") return all.slice(0, limit);
  const ranked: Array<{ s: VariableSuggestion; score: number }> = [];
  for (const s of all) {
    const score = `${s.group ?? ""} ${s.label} ${s.token}`.toLowerCase().indexOf(q);
    if (score >= 0) ranked.push({ s, score });
  }
  ranked.sort((a, b) => a.score - b.score);
  return ranked.slice(0, limit).map((r) => r.s);
}

export function VariableInput({
  value,
  onChange,
  resolveToken,
  placeholder,
  disabled = false,
  multiline = false,
  className,
  "aria-label": ariaLabel,
  onFocusRegister,
  suggestions = [],
}: VariableInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Latest value we serialized OUT, so the sync effect can tell an external
  // change (rebuild + would-be caret reset) from our own edit (skip, keep caret).
  const lastValue = useRef<string>(value);
  // resolveToken read through a ref so its identity changing never triggers a
  // rebuild (which would drop the caret mid-typing) ; new labels apply on the
  // next value-driven rebuild.
  const resolveRef = useRef(resolveToken);
  resolveRef.current = resolveToken;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emit = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = serializeEditor(root);
    lastValue.current = next;
    onChangeRef.current(next);
  }, []);

  // Rebuild the DOM only when `value` diverges from what we last emitted.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (value === lastValue.current && root.dataset.hydrated === "1") return;
    renderInto(root, value, resolveRef.current);
    lastValue.current = value;
    root.dataset.hydrated = "1";
  }, [value]);

  const insertToken = useCallback(
    (rawToken: string) => {
      const root = rootRef.current;
      if (!root || disabled) return;
      const doc = root.ownerDocument;
      root.focus();
      const sel = doc.getSelection();
      const chip = makeChip(rawToken, resolveRef.current, doc);
      if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(chip);
        // A caret can't sit after a trailing non-editable span — guarantee a
        // text node follows so typing continues cleanly.
        if (!chip.nextSibling) chip.after(doc.createTextNode(""));
        range.setStartAfter(chip);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        root.appendChild(chip);
        if (!chip.nextSibling) chip.after(doc.createTextNode(""));
      }
      emit();
    },
    [disabled, emit],
  );

  const handleRef = useRef<VariableInputHandle>({ insertToken });
  handleRef.current.insertToken = insertToken;

  // Inline autocomplete state. `menu` holds the filtered rows + the highlighted
  // index ; null = closed. The menu renders in normal flow directly under the
  // field (not an overlay), so it's always visible and never clipped by the
  // scrolling inspector panel / mobile sheet, on any device. Suggestions are
  // read through a ref so the callbacks stay stable + see the latest set.
  const [menu, setMenu] = useState<{ items: VariableSuggestion[]; index: number } | null>(null);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const menuRef = useRef<HTMLDivElement>(null);

  // Turn a just-completed `{{ … }}` at the caret into a chip immediately (when
  // the closing `}}` is typed), rather than only on the next external rebuild.
  const chipifyCompletedToken = useCallback((): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    const doc = root.ownerDocument;
    const sel = doc.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
    const { startContainer, startOffset } = sel.getRangeAt(0);
    if (startContainer.nodeType !== Node.TEXT_NODE || !root.contains(startContainer)) return false;
    const textNode = startContainer as Text;
    const text = textNode.textContent ?? "";
    // A complete, non-nested token ending exactly at the caret.
    const match = /\{\{[^{}]*\}\}$/.exec(text.slice(0, startOffset));
    if (!match) return false;
    const parent = textNode.parentNode;
    if (!parent) return false;
    const start = startOffset - match[0].length;
    const chip = makeChip(match[0], resolveRef.current, doc);
    const afterNode = doc.createTextNode(text.slice(startOffset));
    textNode.textContent = text.slice(0, start);
    parent.insertBefore(chip, textNode.nextSibling);
    parent.insertBefore(afterNode, chip.nextSibling);
    const range = doc.createRange();
    range.setStart(afterNode, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }, []);

  const refreshMenu = useCallback(() => {
    const root = rootRef.current;
    const all = suggestionsRef.current;
    if (!root || disabled || all.length === 0) {
      setMenu(null);
      return;
    }
    const aq = activeQueryAt(root);
    if (!aq) {
      setMenu(null);
      return;
    }
    const items = filterSuggestions(all, aq.query);
    setMenu(items.length > 0 ? { items, index: 0 } : null);
  }, [disabled]);

  // Replace the `{{ draft` at the caret with the chosen token as a chip.
  const acceptSuggestion = useCallback(
    (item: VariableSuggestion) => {
      const root = rootRef.current;
      if (!root) return;
      const doc = root.ownerDocument;
      const aq = activeQueryAt(root);
      setMenu(null);
      if (!aq || !aq.textNode.parentNode) {
        insertToken(item.token);
        return;
      }
      const text = aq.textNode.textContent ?? "";
      const parent = aq.textNode.parentNode;
      const chip = makeChip(item.token, resolveRef.current, doc);
      const afterNode = doc.createTextNode(text.slice(aq.end));
      aq.textNode.textContent = text.slice(0, aq.start);
      parent.insertBefore(chip, aq.textNode.nextSibling);
      parent.insertBefore(afterNode, chip.nextSibling);
      const range = doc.createRange();
      range.setStart(afterNode, 0);
      range.collapse(true);
      const sel = doc.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      root.focus();
      emit();
    },
    [emit, insertToken],
  );

  // Keep the highlighted row scrolled into view as the user arrows through.
  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [menu?.index]);

  const NAV_KEYS = ["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"];
  const handleInput = () => {
    // If a `}}` just completed a token, chipify it and close the menu ; else
    // re-run the suggestion filter for the current draft.
    const chipified = chipifyCompletedToken();
    emit();
    if (chipified) setMenu(null);
    else refreshMenu();
  };
  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // While the menu owns Up/Down/Enter/Tab/Esc, don't let their keyup re-filter
    // (that would reset the highlight) ; every other key may move the draft.
    if (menu && NAV_KEYS.includes(e.key)) return;
    refreshMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    if (menu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenu((m) => (m ? { ...m, index: (m.index + 1) % m.items.length } : m));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenu((m) => (m ? { ...m, index: (m.index - 1 + m.items.length) % m.items.length } : m));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = menu.items[menu.index];
        if (item) acceptSuggestion(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!multiline) return;
      // Insert a newline as plain text so serialization stays flat (no <div>).
      const sel = root.ownerDocument.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const nl = root.ownerDocument.createTextNode("\n");
        range.insertNode(nl);
        range.setStartAfter(nl);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        emit();
      }
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      const chip = chipAdjacentToCaret(root, e.key === "Backspace" ? "back" : "forward");
      if (chip) {
        e.preventDefault();
        chip.remove();
        emit();
      }
    }
  };

  // Paste as plain text only — keeps foreign HTML (and its own chips) out.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const text = e.clipboardData.getData("text/plain");
    const sel = root.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = root.ownerDocument.createTextNode(multiline ? text : text.replace(/\n/g, " "));
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    emit();
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={rootRef}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onMouseUp={refreshMenu}
        onPaste={handlePaste}
        onFocus={() => onFocusRegister?.(handleRef.current)}
        onBlur={() => {
          onFocusRegister?.(null);
          setMenu(null);
        }}
        className={cn(
          "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          multiline
            ? "min-h-[5.5rem] whitespace-pre-wrap break-words"
            : "min-h-9 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden",
          disabled && "cursor-not-allowed opacity-50",
        )}
        style={{ WebkitOverflowScrolling: "touch" } as CSSProperties}
      />
      {value === "" && placeholder ? (
        <span className="pointer-events-none absolute left-3 top-1.5 select-none text-sm text-muted-foreground">
          {placeholder}
        </span>
      ) : null}
      {menu ? (
        <div
          ref={menuRef}
          role="listbox"
          // In normal flow, directly under the field — never clipped, no
          // positioning math, identical on desktop + mobile.
          className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {menu.items.map((item, i) => {
            const showHeader = item.group && (i === 0 || item.group !== menu.items[i - 1]?.group);
            const isActive = i === menu.index;
            return (
              <Fragment key={`${item.token}:${i}`}>
                {showHeader ? (
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {item.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? "" : undefined}
                  // pointerdown covers touch + mouse ; preventDefault keeps the
                  // field focused so the tap selects instead of blurring it away.
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerEnter={() => setMenu((m) => (m ? { ...m, index: i } : m))}
                  onClick={() => acceptSuggestion(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
                    isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint ? (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              </Fragment>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
