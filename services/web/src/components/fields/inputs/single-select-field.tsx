"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useFormContext, type ControllerRenderProps } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FormControl, FormField } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, SingleSelectFieldDef } from "../types";

/** Above this many options the searchable combobox is used by default. */
const COMBOBOX_THRESHOLD = 8;

function resolveVariant(def: SingleSelectFieldDef): "select" | "combobox" | "radio" {
  if (def.variant) return def.variant;
  if (def.searchable || def.options.length > COMBOBOX_THRESHOLD) {
    return "combobox";
  }
  return "select";
}

function RadioControl({ def, field }: { def: SingleSelectFieldDef; field: ControllerRenderProps }) {
  const value = (field.value as string | null) ?? "";
  return (
    <FormControl>
      <RadioGroup value={value} onValueChange={field.onChange} disabled={def.disabled}>
        {def.options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <RadioGroupItem value={o.value} />
            {def.badges ? (
              <Badge variant={o.tone ?? "secondary"}>{o.label}</Badge>
            ) : (
              <span>{o.label}</span>
            )}
          </label>
        ))}
      </RadioGroup>
    </FormControl>
  );
}

function ComboboxControl({
  def,
  labels,
  field,
}: {
  def: SingleSelectFieldDef;
  labels: FieldInputProps["labels"];
  field: ControllerRenderProps;
}) {
  const [open, setOpen] = useState(false);
  const value = (field.value as string | null) ?? null;
  const selected = def.options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={def.disabled}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? (
              def.badges ? (
                <Badge variant={selected.tone ?? "secondary"}>{selected.label}</Badge>
              ) : (
                selected.label
              )
            ) : (
              (def.placeholder ?? labels.selectPlaceholder)
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={def.placeholder ?? labels.searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{labels.noResults}</CommandEmpty>
            <CommandGroup>
              {def.options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    field.onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  {def.badges ? <Badge variant={o.tone ?? "secondary"}>{o.label}</Badge> : o.label}
                </CommandItem>
              ))}
              {value && !def.required ? (
                <CommandItem
                  value="__clear__"
                  className="text-muted-foreground"
                  onSelect={() => {
                    field.onChange(null);
                    setOpen(false);
                  }}
                >
                  {labels.clear}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SelectControl({
  def,
  labels,
  field,
}: {
  def: SingleSelectFieldDef;
  labels: FieldInputProps["labels"];
  field: ControllerRenderProps;
}) {
  const value = (field.value as string | null) ?? undefined;
  const selected = def.options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={field.onChange} disabled={def.disabled}>
      <FormControl>
        <SelectTrigger>
          {def.badges && selected ? (
            <Badge variant={selected.tone ?? "secondary"}>{selected.label}</Badge>
          ) : (
            <SelectValue placeholder={def.placeholder ?? labels.selectPlaceholder} />
          )}
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {def.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {def.badges ? <Badge variant={o.tone ?? "secondary"}>{o.label}</Badge> : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SingleSelectField({ def, labels }: FieldInputProps<SingleSelectFieldDef>) {
  const { control } = useFormContext();
  const variant = resolveVariant(def);
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => (
        <FieldShell def={def}>
          {variant === "radio" ? (
            <RadioControl def={def} field={field} />
          ) : variant === "combobox" ? (
            <ComboboxControl def={def} labels={labels} field={field} />
          ) : (
            <SelectControl def={def} labels={labels} field={field} />
          )}
        </FieldShell>
      )}
    />
  );
}
