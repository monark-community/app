"use client";

import type { Block } from "@blocknote/core";
import type { ControllerRenderProps } from "react-hook-form";
import { useFormContext } from "react-hook-form";
import { FormField } from "@/components/ui/form";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, DocumentFieldDef } from "../types";
import { BlockEditor } from "./block-editor";

function BlockControl({ def, field }: { def: DocumentFieldDef; field: ControllerRenderProps }) {
  return (
    <BlockEditor
      value={(field.value as Block[] | null) ?? []}
      onChange={field.onChange}
      editable={!def.disabled}
      placeholder={def.placeholder}
      fill={def.fill}
      ariaLabel={def.label}
    />
  );
}

/**
 * RHF-bound block-document field for `AutoForm`. The BlockNote editor seeds from
 * the field's initial value and streams block-array edits back through
 * `field.onChange` ; because the editor is create-once, the host form should
 * remount per record (the detail-panel pattern already keys on record id).
 */
export function BlockField({ def }: FieldInputProps<DocumentFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => (
        <FieldShell def={def}>
          <BlockControl def={def} field={field} />
        </FieldShell>
      )}
    />
  );
}
