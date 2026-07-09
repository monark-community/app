"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { tryEvaluateFormula, type FormulaValue } from "@monark/data-models/contracts";
import { FormField } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, FieldLabels, FormulaFieldDef, FormulaResultType } from "../types";

/**
 * Formats a raw formula result for the read-only display, by the field's
 * declared result type. Mirrors the table cell's formula formatting so the
 * form preview and the cell agree.
 */
function formatValue(
  value: FormulaValue,
  resultType: FormulaResultType,
  labels: FieldLabels,
): string | null {
  if (value === null || value === "") return null;
  switch (resultType) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n.toLocaleString() : null;
    }
    case "boolean":
      return value ? labels.yes : labels.no;
    case "date": {
      const d = value instanceof Date ? value : new Date(value as string | number);
      return Number.isNaN(d.getTime())
        ? null
        : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    default:
      return String(value);
  }
}

/**
 * Read-only computed field. Watches its sibling form values and evaluates the
 * formula live with the SAME engine the server uses on write, so the preview a
 * user sees while filling the form matches what gets stored. It never writes to
 * form state (the value is authoritative from the server), so it can't dirty
 * the form or be edited.
 */
export function FormulaField({ def, labels }: FieldInputProps<FormulaFieldDef>) {
  const { control } = useFormContext();
  // Watch the whole values object so the preview recomputes as any referenced
  // field changes ; keys are field keys, which is exactly the formula scope.
  const values = useWatch({ control }) as Record<string, unknown>;
  const result = tryEvaluateFormula(def.expression, values ?? {});
  const display = result.ok ? formatValue(result.value, def.resultType, labels) : null;

  // Wrap in FormField so FieldShell's FormLabel / FormMessage get their RHF
  // field context (like every other input). The bound `field` is unused — the
  // value is computed + read-only, never edited here.
  return (
    <FormField
      control={control}
      name={def.name}
      render={() => (
        <FieldShell def={def}>
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "flex min-h-9 w-full items-center rounded-md border border-dashed border-input bg-muted/40 px-3 py-1.5 text-sm",
              def.resultType === "number" && "justify-end tabular-nums",
              display === null && "text-muted-foreground",
            )}
          >
            {display ?? "—"}
          </div>
        </FieldShell>
      )}
    />
  );
}
