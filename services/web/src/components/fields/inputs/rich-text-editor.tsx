"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
  Unlink,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { RichTextToolbarLabels } from "../types";

/** A single toolbar toggle button. Preserves editor selection on click. */
function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("h-8 w-8", active && "bg-accent text-accent-foreground")}
    >
      {children}
    </Button>
  );
}

function LinkButton({
  editor,
  labels,
  disabled,
}: {
  editor: Editor;
  labels: RichTextToolbarLabels;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const active = editor.isActive("link");

  function apply() {
    const trimmed = url.trim();
    if (trimmed === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={labels.link}
          aria-label={labels.link}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          className={cn("h-8 w-8", active && "bg-accent text-accent-foreground")}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex items-center gap-1">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={labels.linkUrlPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            autoFocus
            className="h-8"
          />
          <Button type="button" size="sm" onClick={apply}>
            {labels.linkApply}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// The heading levels offered by the text-style dropdown, with their icon +
// label key. Kept in sync with the StarterKit `heading.levels` config below.
const HEADING_LEVELS = [1, 2, 3, 4] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];
const HEADING_ICON: Record<HeadingLevel, ComponentType<{ className?: string }>> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
  4: Heading4,
};

/**
 * Text-style picker: collapses Paragraph + Heading 1–4 into one dropdown so the
 * toolbar stays compact. The trigger shows the current block's icon ; selecting
 * an entry sets that block type (idempotent, unlike the toggle buttons).
 */
function HeadingSelect({
  editor,
  labels,
  disabled,
}: {
  editor: Editor;
  labels: RichTextToolbarLabels;
  disabled?: boolean;
}) {
  const activeLevel = HEADING_LEVELS.find((l) => editor.isActive("heading", { level: l }));
  const TriggerIcon = activeLevel ? HEADING_ICON[activeLevel] : Pilcrow;
  const headingLabel: Record<HeadingLevel, string> = {
    1: labels.heading1,
    2: labels.heading2,
    3: labels.heading3,
    4: labels.heading4,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={labels.textStyle}
          title={labels.textStyle}
          onMouseDown={(e) => e.preventDefault()}
          className="h-8 gap-1 px-1.5"
        >
          <TriggerIcon className="h-4 w-4" aria-hidden />
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuItem
          className={cn(!activeLevel && "bg-accent font-medium")}
          onSelect={() => editor.chain().focus().setParagraph().run()}
        >
          <Pilcrow className="mr-2 h-4 w-4" aria-hidden />
          {labels.paragraph}
        </DropdownMenuItem>
        {HEADING_LEVELS.map((level) => {
          const Icon = HEADING_ICON[level];
          return (
            <DropdownMenuItem
              key={level}
              className={cn(activeLevel === level && "bg-accent font-medium")}
              onSelect={() => editor.chain().focus().setHeading({ level }).run()}
            >
              <Icon className="mr-2 h-4 w-4" aria-hidden />
              {headingLabel[level]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Toolbar({
  editor,
  labels,
  disabled,
}: {
  editor: Editor;
  labels: RichTextToolbarLabels;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
      <HeadingSelect editor={editor} labels={labels} disabled={disabled} />

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <ToolbarButton
        label={labels.bold}
        active={editor.isActive("bold")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.italic}
        active={editor.isActive("italic")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.strike}
        active={editor.isActive("strike")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.code}
        active={editor.isActive("code")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" aria-hidden />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <ToolbarButton
        label={labels.bulletList}
        active={editor.isActive("bulletList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.orderedList}
        active={editor.isActive("orderedList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.blockquote}
        active={editor.isActive("blockquote")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" aria-hidden />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <LinkButton editor={editor} labels={labels} disabled={disabled} />
      {/* Unlink only makes sense on an existing link, so it appears then. */}
      {editor.isActive("link") && (
        <ToolbarButton
          label={labels.unlink}
          disabled={disabled}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-4 w-4" aria-hidden />
        </ToolbarButton>
      )}
    </div>
  );
}

/**
 * Standalone, controlled TipTap rich-text editor (value = sanitized HTML
 * string, `""` when empty). Framework-agnostic — no react-hook-form — so it
 * drops into plain `useState` forms as well as the RHF-bound
 * {@link RichTextField} that wraps it. Pass already-translated toolbar
 * `labels` (from `useFieldStrings().labels.richText`). Render the saved value
 * read-only with `RichTextView`.
 */
export function RichTextEditor({
  value,
  onChange,
  onBlur,
  labels,
  placeholder,
  disabled,
  minHeight = 32,
  fill = false,
  ariaLabel,
  id,
  describedBy,
  error,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  labels: RichTextToolbarLabels;
  placeholder?: string;
  disabled?: boolean;
  /** Minimum editor body height, in 0.25rem units (default 32 → 8rem). */
  minHeight?: number;
  /**
   * Grow to fill the parent's available height instead of sizing to content.
   * The editor becomes a flex column (toolbar fixed, body flex-1 + scroll) ;
   * the parent must give it a resolvable height (e.g. a `flex-1` / stretched
   * grid cell). `minHeight` is ignored in this mode.
   */
  fill?: boolean;
  ariaLabel?: string;
  id?: string;
  describedBy?: string;
  error?: boolean;
  className?: string;
}) {
  const minHeightRem = minHeight * 0.25;

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        // In fill mode the body flexes to the scroll area (so clicking anywhere
        // in the empty space focuses) ; otherwise it sizes to a min-height.
        class: cn("rich-text-content px-3 py-2 text-sm focus:outline-none", fill && "min-h-0 flex-1"),
        ...(fill ? {} : { style: `min-height:${minHeightRem}rem` }),
      },
    },
  });

  // Push external value changes (reset / programmatic set) into the editor.
  useEffect(() => {
    if (!editor) return;
    const next = value || "";
    if (next !== editor.getHTML() && !(editor.isEmpty && next === "")) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring",
        fill && "min-h-0 flex-1",
        error && "border-destructive",
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} labels={labels} disabled={disabled} /> : null}
      <EditorContent
        editor={editor}
        onBlur={onBlur}
        className={cn(fill && "flex min-h-0 flex-1 flex-col overflow-y-auto")}
      />
    </div>
  );
}
