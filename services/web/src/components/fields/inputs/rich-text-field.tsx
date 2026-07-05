"use client";

import type { ControllerRenderProps } from "react-hook-form";
import { useFormContext } from "react-hook-form";
import { FormField, useFormField } from "@/components/ui/form";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, RichTextFieldDef } from "../types";
import { RichTextEditor } from "./rich-text-editor";

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

  return (
    <RichTextEditor
      value={(field.value as string) || ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
      labels={labels.richText}
      placeholder={def.placeholder}
      disabled={def.disabled}
      minHeight={def.minHeight ?? 32}
      ariaLabel={def.label}
      id={formItemId}
      describedBy={`${formDescriptionId} ${formMessageId}`}
      error={!!error}
    />
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
