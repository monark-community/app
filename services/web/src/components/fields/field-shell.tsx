"use client";

import type { ReactNode } from "react";
import { FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
  def: Pick<FieldDef, "label" | "description" | "required">;
  children: ReactNode;
  counter?: ReactNode;
  className?: string;
}) {
  return (
    <FormItem className={className}>
      {def.label ? (
        <FormLabel>
          {def.label}
          {def.required ? (
            <span className="text-destructive" aria-hidden>
              {" *"}
            </span>
          ) : null}
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
