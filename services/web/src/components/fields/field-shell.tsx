"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FIELD_TYPE_ICON } from "./field-icons";
import type { FieldDef } from "./types";

/**
 * The standard field wrapper : label (with a `*` when required), the
 * control, help text, then the error message row. Formalizes the
 * `<Label> + control + text-xs help` block that was copy-pasted across
 * every hand-rolled form. Renders inside an RHF `<FormField>` so the
 * nested `FormLabel` / `FormControl` / `FormMessage` wire up automatically.
 *
 * Pass the control (usually wrapped in `<FormControl>`) as `children`.
 *
 * Like the hand-rolled {@link FieldRow}, the label sits **above** the control
 * when space is tight and flips to a left 10rem column once the form's
 * surrounding `@container` (added by {@link AutoForm}) is wide enough (`@md`,
 * ≈448px — the same threshold as `FieldRow`, so AutoForm and hand-rolled forms
 * read identically). `richText` (WYSIWYG) and `longText` (textarea) opt out and
 * always stack : they need the full row width for a usable editing area. The
 * control + help + error stack together in the right column, so a wrapping
 * error aligns under the control, not the label. A `maxLength` limit shows up
 * only as an error (`FormMessage`) when exceeded — no persistent char counter,
 * so a correct form stays uncluttered.
 */
export function FieldShell({
  def,
  children,
  className,
}: {
  def: Pick<FieldDef, "type" | "label" | "description" | "required">;
  children: ReactNode;
  className?: string;
}) {
  const TypeIcon = FIELD_TYPE_ICON[def.type];
  // Wide, tall controls read better full-width, so they never flip. A field
  // without a label can't have a left label column either.
  const stackOnly = def.type === "richText" || def.type === "longText";
  const flip = !stackOnly && !!def.label;
  return (
    <FormItem
      className={cn(
        flip &&
          "@md:grid @md:grid-cols-[10rem_minmax(0,1fr)] @md:items-start @md:gap-x-4 @md:space-y-0",
        className,
      )}
    >
      {def.label ? (
        <FormLabel className={cn("flex items-center gap-1.5", flip && "@md:pt-2")}>
          <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
          <span>
            {def.label}
            {def.required ? (
              <span className="text-destructive" aria-hidden>
                {" *"}
              </span>
            ) : null}
          </span>
        </FormLabel>
      ) : null}
      <div className="min-w-0 space-y-2">
        {children}
        {def.description ? <FormDescription>{def.description}</FormDescription> : null}
        <FormMessage />
      </div>
    </FormItem>
  );
}
