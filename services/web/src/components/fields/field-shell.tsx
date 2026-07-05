"use client";

import type { ReactNode } from "react";
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
 * `counter` renders a right-aligned hint on the message row (char count).
 */
export function FieldShell({
  def,
  children,
  counter,
  className,
}: {
  def: Pick<FieldDef, "type" | "label" | "description" | "required">;
  children: ReactNode;
  counter?: ReactNode;
  className?: string;
}) {
  const TypeIcon = FIELD_TYPE_ICON[def.type];
  return (
    <FormItem className={className}>
      {def.label ? (
        <FormLabel className="flex items-center gap-1.5">
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
      {children}
      {def.description ? <FormDescription>{def.description}</FormDescription> : null}
      {counter ? (
        <div className="flex items-start justify-between gap-2">
          <FormMessage />
          <span className="shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
            {counter}
          </span>
        </div>
      ) : (
        <FormMessage />
      )}
    </FormItem>
  );
}
