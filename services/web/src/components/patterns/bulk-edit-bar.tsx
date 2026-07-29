"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import type { FieldValues } from "react-hook-form";
import { AutoForm, type FieldDef } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Translated chrome for the bulk-edit bar + dialog (i18n stays with caller). */
export interface BulkEditLabels {
  /** e.g. "{count} selected" — the selected-row count shown on the bar. */
  selectedCount: (count: number) => string;
  /** Bar button that opens the edit dialog. */
  edit: string;
  /** Bar button that clears the selection. */
  clear: string;
  /** Dialog heading. */
  dialogTitle: string;
  /** Label above the field picker. */
  fieldLabel: string;
  /** Placeholder in the empty field picker. */
  fieldPlaceholder: string;
  /** Apply button ; receives the selected-row count. */
  apply: (count: number) => string;
  /** Cancel button. */
  cancel: string;
  /** Shown when the selected rows don't all share the same current value for
   *  the chosen field (the "overwrite all" warning). */
  differsWarning: string;
}

/** True when every value is identical (deep-compared via JSON). */
function allEqual(values: unknown[]): boolean {
  if (values.length <= 1) return true;
  const first = JSON.stringify(values[0] ?? null);
  return values.every((v) => JSON.stringify(v ?? null) === first);
}

/**
 * Bulk-edit affordance for a {@link DataTable} with `selection`. Renders a
 * compact bar (count + edit + clear) whenever rows are selected, and an edit
 * dialog that lets the user pick one of the model's editable fields and set a
 * single value across every selected row. When the selected rows currently
 * hold different values for the chosen field, an overwrite warning is shown
 * before applying.
 *
 * Field-agnostic : it drives the value editor from the passed `FieldDef`s (the
 * data model's own fields), reusing `AutoForm` for the per-type input +
 * validation. Exclude read-only / computed fields (e.g. `formula`) upstream.
 * Renders nothing when nothing is selected.
 */
export function BulkEditBar({
  count,
  fields,
  selectedValues,
  onApply,
  onClear,
  isApplying = false,
  labels,
  className,
}: {
  /** Number of selected rows. */
  count: number;
  /** Editable field descriptors (the data model's fields, minus computed ones). */
  fields: FieldDef[];
  /** Current values of one field across the selected rows — used to detect
   *  whether applying would overwrite differing values. */
  selectedValues: (fieldName: string) => unknown[];
  /** Persist the new value on every selected row. */
  onApply: (fieldName: string, value: unknown) => Promise<void>;
  /** Clear the selection. */
  onClear: () => void;
  isApplying?: boolean;
  labels: BulkEditLabels;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fieldName, setFieldName] = useState<string | undefined>(undefined);

  const editable = useMemo(() => fields.filter((f) => f.type !== "formula"), [fields]);
  const pickedField = editable.find((f) => f.name === fieldName);

  const differs = pickedField ? !allEqual(selectedValues(pickedField.name)) : false;

  function reset() {
    setOpen(false);
    setFieldName(undefined);
  }

  async function handleSubmit(values: FieldValues) {
    if (!pickedField) return;
    await onApply(pickedField.name, values[pickedField.name]);
    reset();
    onClear();
  }

  if (count === 0) return null;

  const picker = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="bulk-edit-field">
          {labels.fieldLabel}
        </label>
        <Select value={fieldName} onValueChange={setFieldName}>
          <SelectTrigger id="bulk-edit-field" className="w-full">
            <SelectValue placeholder={labels.fieldPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {editable.map((f) => (
              <SelectItem key={f.name} value={f.name}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {differs && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/5 p-3 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{labels.differsWarning}</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2",
        className,
      )}
    >
      <span className="text-sm font-medium">{labels.selectedCount(count)}</span>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
          {labels.edit}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="mr-1 h-3.5 w-3.5" aria-hidden />
          {labels.clear}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFieldName(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
          </DialogHeader>
          {pickedField ? (
            // Remount per field so AutoForm rebuilds its resolver + empty
            // default for the newly-picked field.
            <AutoForm
              key={pickedField.name}
              fields={[pickedField]}
              onSubmit={handleSubmit}
              onCancel={reset}
              submitLabel={labels.apply(count)}
              cancelLabel={labels.cancel}
              isBusy={isApplying}
              header={picker}
            />
          ) : (
            picker
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
