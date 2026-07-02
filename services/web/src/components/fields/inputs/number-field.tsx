"use client";

import { useEffect, useState } from "react";
import { useFormContext, type ControllerRenderProps } from "react-hook-form";
import { FormControl, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, NumberFieldDef } from "../types";

/**
 * Numeric input. Keeps a local text buffer so intermediate states
 * (a trailing "." while typing a decimal) survive, and pushes the
 * parsed `number | null` to form state. Integer / range constraints
 * are enforced by the registry's zod schema, not here.
 */
function NumberControl({ def, field }: { def: NumberFieldDef; field: ControllerRenderProps }) {
  const external = field.value == null ? "" : String(field.value);
  const [text, setText] = useState(external);

  // Re-sync the buffer when the form value changes from the outside
  // (reset / programmatic set), but not on our own keystrokes.
  useEffect(() => {
    const current = text.trim() === "" ? null : Number(text);
    const drifted = field.value !== current && !(Number.isNaN(current) && field.value == null);
    if (drifted) setText(field.value == null ? "" : String(field.value));
  }, [field.value]);

  function commit(raw: string) {
    setText(raw);
    const trimmed = raw.trim();
    if (trimmed === "") {
      field.onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    field.onChange(Number.isNaN(parsed) ? null : parsed);
  }

  return (
    <div className="relative">
      {def.prefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {def.prefix}
        </span>
      ) : null}
      <FormControl>
        <Input
          name={field.name}
          ref={field.ref}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={field.onBlur}
          inputMode={def.integer ? "numeric" : "decimal"}
          placeholder={def.placeholder}
          disabled={def.disabled}
          className={cn("text-right tabular-nums", def.prefix && "pl-7", def.suffix && "pr-9")}
        />
      </FormControl>
      {def.suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {def.suffix}
        </span>
      ) : null}
    </div>
  );
}

export function NumberField({ def }: FieldInputProps<NumberFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => (
        <FieldShell def={def}>
          <NumberControl def={def} field={field} />
        </FieldShell>
      )}
    />
  );
}
