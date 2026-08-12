"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/ariakit";
import { type Block } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/ariakit/style.css";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export type BlockEditorProps = {
  /** Current content as a BlockNote block array. Seeds the editor on mount. */
  value: Block[];
  /** Called with the full block array on every edit. */
  onChange?: (blocks: Block[]) => void;
  /** When false, the editor is read-only (no toolbar, no slash menu). */
  editable?: boolean;
  /** Slash-menu / empty-line hint text. */
  placeholder?: string;
  /** Grow to fill the parent's height (the parent must be a flex column). */
  fill?: boolean;
  /** Minimum editable height in px (gives an empty editor a usable click area). */
  minHeight?: number;
  className?: string;
  ariaLabel?: string;
};

// Override just the placeholder strings on the English dictionary when a custom
// placeholder is supplied ; everything else stays default.
function dictionaryFor(placeholder?: string) {
  if (!placeholder) return en;
  return {
    ...en,
    placeholders: {
      ...en.placeholders,
      emptyDocument: placeholder,
      default: placeholder,
    },
  };
}

/**
 * The BlockNote editor, client-only (it touches the DOM, so it's loaded via a
 * `dynamic(..., { ssr: false })` wrapper in `block-editor.tsx`).
 *
 * Create-once / uncontrolled : the editor is built exactly once from the value
 * present at mount and is the source of truth thereafter (`onChange` streams
 * edits out ; we never feed `value` back in). The options object is memoized so
 * that re-renders from `onChange` → parent state never rebuild the editor — a
 * rebuilt ProseMirror view would drop the in-flight keystroke (e.g. Enter). To
 * load a *different* document, remount by keying the element on the document id.
 */
export function BlockEditorImpl({
  value,
  onChange,
  editable = true,
  placeholder,
  fill,
  minHeight,
  className,
  ariaLabel,
}: BlockEditorProps) {
  const { resolvedTheme } = useTheme();

  // Captured once (empty deps) : BlockNote's `initialContent` must be a NON-empty
  // array or `undefined` (an empty `[]` throws). A stable options object keeps the
  // editor from being recreated on every render.
  const options = useMemo(
    () => ({
      initialContent: value.length > 0 ? value : undefined,
      dictionary: dictionaryFor(placeholder),
    }),
    // Intentionally create-once ; see the doc comment. `value`/`placeholder` are
    // read only at mount (the component is remounted per document via `key`).
    [],
  );
  const editor = useCreateBlockNote(options);

  // Reflect a changing `editable` onto the live editor without recreating it.
  useEffect(() => {
    editor.isEditable = editable;
  }, [editor, editable]);

  return (
    <div
      className={cn("block-editor", fill && "flex h-full flex-col", className)}
      style={minHeight ? ({ "--bn-min-h": `${minHeight}px` } as CSSProperties) : undefined}
      aria-label={ariaLabel}
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme === "light" ? "light" : "dark"}
        onChange={onChange ? () => onChange(editor.document) : undefined}
      />
    </div>
  );
}
