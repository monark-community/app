"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
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
import { FieldShell } from "../field-shell";
import type { FieldInputProps, MultiSelectFieldDef } from "../types";
import { Chip } from "./chips";

export function MultiSelectField({ def, labels }: FieldInputProps<MultiSelectFieldDef>) {
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => {
        const values = (field.value as string[] | undefined) ?? [];
        const byValue = new Map(def.options.map((o) => [o.value, o]));
        const atCapacity = def.max != null && values.length >= def.max;
        const trimmed = query.trim();
        const available = def.options.filter((o) => !values.includes(o.value));
        const exactExists =
          trimmed.length > 0 &&
          (byValue.has(trimmed) ||
            def.options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase()) ||
            values.some((v) => v.toLowerCase() === trimmed.toLowerCase()));

        function add(value: string) {
          if (values.includes(value) || atCapacity) return;
          field.onChange([...values, value]);
        }
        function remove(value: string) {
          field.onChange(values.filter((v) => v !== value));
        }

        return (
          <FieldShell def={def}>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input p-2">
              {values.length === 0 ? (
                <span className="px-1 text-sm text-muted-foreground">
                  {def.placeholder ?? labels.selectPlaceholder}
                </span>
              ) : null}
              {values.map((v) => {
                const label = byValue.get(v)?.label ?? v;
                return (
                  <Chip
                    key={v}
                    label={label}
                    removeLabel={labels.remove(label)}
                    onRemove={() => remove(v)}
                    disabled={def.disabled}
                    tone={def.badges ? byValue.get(v)?.tone : undefined}
                  />
                );
              })}
              {!def.disabled && !atCapacity ? (
                <Popover
                  open={open}
                  onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) setQuery("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                      >
                        <Plus className="h-3 w-3" aria-hidden />
                        {labels.add}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0">
                    <Command shouldFilter={!def.allowCustom}>
                      <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder={def.placeholder ?? labels.searchPlaceholder}
                      />
                      <CommandList>
                        <CommandEmpty>{labels.noResults}</CommandEmpty>
                        <CommandGroup>
                          {available.map((o) => (
                            <CommandItem
                              key={o.value}
                              value={o.label}
                              onSelect={() => add(o.value)}
                            >
                              {def.badges ? (
                                <Badge variant={o.tone ?? "secondary"}>{o.label}</Badge>
                              ) : (
                                o.label
                              )}
                            </CommandItem>
                          ))}
                          {def.allowCustom && trimmed.length > 0 && !exactExists ? (
                            <CommandItem
                              value={`__create__${trimmed}`}
                              onSelect={() => {
                                add(trimmed);
                                setQuery("");
                              }}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                              {labels.createOption(trimmed)}
                            </CommandItem>
                          ) : null}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </FieldShell>
        );
      }}
    />
  );
}
