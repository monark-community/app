"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Unlink,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useFormContext, type ControllerRenderProps } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField, useFormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, RichTextFieldDef, RichTextToolbarLabels } from "../types";

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
        label={labels.heading1}
        active={editor.isActive("heading", { level: 1 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.heading2}
        active={editor.isActive("heading", { level: 2 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" aria-hidden />
      </ToolbarButton>
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
      <ToolbarButton
        label={labels.unlink}
        disabled={disabled || !editor.isActive("link")}
        onClick={() => editor.chain().focus().unsetLink().run()}
      >
        <Unlink className="h-4 w-4" aria-hidden />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <ToolbarButton
        label={labels.undo}
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label={labels.redo}
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" aria-hidden />
      </ToolbarButton>
    </div>
  );
}

function RichTextControl({
  def,
  labels,
  field,
}: {
  def: RichTextFieldDef;
  labels: FieldInputProps["labels"];
  field: ControllerRenderProps;
}) {
  const { formItemId, formDescriptionId, formMessageId, error } = useFormField();
  const minHeightRem = (def.minHeight ?? 32) * 0.25;

  const editor = useEditor({
    immediatelyRender: false,
    editable: !def.disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: def.placeholder ?? "" }),
    ],
    content: (field.value as string) || "",
    onUpdate: ({ editor }) => field.onChange(editor.isEmpty ? "" : editor.getHTML()),
    editorProps: {
      attributes: {
        id: formItemId,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": def.label,
        "aria-describedby": `${formDescriptionId} ${formMessageId}`,
        class: "rich-text-content px-3 py-2 text-sm focus:outline-none",
        style: `min-height:${minHeightRem}rem`,
      },
    },
  });

  // Push external value changes (reset / programmatic set) into the editor.
  useEffect(() => {
    if (!editor) return;
    const next = (field.value as string) || "";
    if (next !== editor.getHTML() && !(editor.isEmpty && next === "")) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [field.value, editor]);

  useEffect(() => {
    editor?.setEditable(!def.disabled);
  }, [editor, def.disabled]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring",
        error && "border-destructive",
      )}
    >
      {editor ? <Toolbar editor={editor} labels={labels.richText} disabled={def.disabled} /> : null}
      <EditorContent editor={editor} onBlur={field.onBlur} />
    </div>
  );
}

export function RichTextField({ def, labels }: FieldInputProps<RichTextFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => (
        <FieldShell def={def}>
          <RichTextControl def={def} labels={labels} field={field} />
        </FieldShell>
      )}
    />
  );
}
