"use client";

import { useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import type { BooleanFieldDef, FieldInputProps } from "../types";

/**
 * Boolean field rendered as a settings-style row : label + help on the
 * left, the toggle on the right. Uses `Switch` by default ; opt into
 * `control: "checkbox"` for list-style multi-toggle forms.
 */
export function BooleanField({ def }: FieldInputProps<BooleanFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => {
        const checked = Boolean(field.value);
        return (
          <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <FormLabel>{def.label}</FormLabel>
              {def.description ? <FormDescription>{def.description}</FormDescription> : null}
            </div>
            <FormControl>
              {def.control === "checkbox" ? (
                <Checkbox
                  checked={checked}
                  disabled={def.disabled}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              ) : (
                <Switch
                  checked={checked}
                  disabled={def.disabled}
                  onCheckedChange={field.onChange}
                />
              )}
            </FormControl>
          </FormItem>
        );
      }}
    />
  );
}
