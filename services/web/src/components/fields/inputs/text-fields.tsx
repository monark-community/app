"use client";

import { Link2, Mail } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FieldShell } from "../field-shell";
import type {
  EmailFieldDef,
  FieldInputProps,
  LongTextFieldDef,
  TextFieldDef,
  UrlFieldDef,
} from "../types";

/** Single-line text input. */
export function TextField({ def }: FieldInputProps<TextFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => {
        const value = (field.value as string | undefined) ?? "";
        return (
          <FieldShell def={def}>
            <FormControl>
              <Input
                {...field}
                value={value}
                placeholder={def.placeholder}
                disabled={def.disabled}
                maxLength={def.maxLength}
              />
            </FormControl>
          </FieldShell>
        );
      }}
    />
  );
}

/** Multi-line text input with an auto-growing textarea. */
export function LongTextField({ def }: FieldInputProps<LongTextFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => {
        const value = (field.value as string | undefined) ?? "";
        return (
          <FieldShell def={def}>
            <FormControl>
              <Textarea
                {...field}
                value={value}
                placeholder={def.placeholder}
                disabled={def.disabled}
                maxLength={def.maxLength}
                rows={def.rows ?? 4}
                className="field-sizing-content min-h-20 resize-none"
              />
            </FormControl>
          </FieldShell>
        );
      }}
    />
  );
}

/** Text input with a leading icon (shared by url + email). */
function IconTextField({
  def,
  icon: Icon,
  type,
  inputMode,
}: {
  def: UrlFieldDef | EmailFieldDef;
  icon: typeof Link2;
  type: "url" | "email";
  inputMode: "url" | "email";
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => {
        const value = (field.value as string | undefined) ?? "";
        return (
          <FieldShell def={def}>
            <div className="relative">
              <Icon
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <FormControl>
                <Input
                  {...field}
                  value={value}
                  type={type}
                  inputMode={inputMode}
                  placeholder={def.placeholder}
                  disabled={def.disabled}
                  maxLength={def.maxLength}
                  className={cn("pl-9")}
                />
              </FormControl>
            </div>
          </FieldShell>
        );
      }}
    />
  );
}

/** URL input with a leading link icon (validated as http(s) by the schema). */
export function UrlField({ def }: FieldInputProps<UrlFieldDef>) {
  return <IconTextField def={def} icon={Link2} type="url" inputMode="url" />;
}

/** Email input with a leading mail icon. */
export function EmailField({ def }: FieldInputProps<EmailFieldDef>) {
  return <IconTextField def={def} icon={Mail} type="email" inputMode="email" />;
}
