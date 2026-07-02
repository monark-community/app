"use client";

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormContext, type ControllerRenderProps } from "react-hook-form";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FieldAvatar } from "../field-avatar";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, RelationFieldDef, RelationOption } from "../types";
import { useDebounced } from "../use-debounced";
import { Chip } from "./chips";

function RelationControl({
  def,
  labels,
  field,
}: {
  def: RelationFieldDef;
  labels: FieldInputProps["labels"];
  field: ControllerRenderProps;
}) {
  const multiple = def.multiple ?? false;
  const value = field.value as string[] | string | null;
  const ids: string[] = multiple
    ? ((value as string[] | undefined) ?? [])
    : value
      ? [value as string]
      : [];
  const idsKey = ids.join(",");

  const [cache, setCache] = useState<Record<string, RelationOption>>({});
  const [open, setOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const query = useDebounced(rawQuery.trim(), 250);
  const [results, setResults] = useState<RelationOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Hydrate labels for already-selected ids (edit mode).
  useEffect(() => {
    const missing = ids.filter((id) => !cache[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void def.source
      .loadByIds(missing)
      .then((opts) => {
        if (cancelled) return;
        setCache((prev) => ({
          ...prev,
          ...Object.fromEntries(opts.map((o) => [o.id, o])),
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  // Search when the popover is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void def.source
      .loadOptions(query)
      .then((opts) => {
        if (cancelled) return;
        setResults(opts);
        setCache((prev) => ({
          ...prev,
          ...Object.fromEntries(opts.map((o) => [o.id, o])),
        }));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, open]);

  const atCapacity = multiple && def.max != null && ids.length >= def.max;

  function add(id: string) {
    if (ids.includes(id) || atCapacity) return;
    field.onChange(multiple ? [...ids, id] : id);
    if (!multiple) setOpen(false);
  }
  function remove(id: string) {
    field.onChange(multiple ? ids.filter((x) => x !== id) : null);
  }

  const list = (
    <Command shouldFilter={false}>
      <CommandInput
        value={rawQuery}
        onValueChange={setRawQuery}
        placeholder={def.placeholder ?? labels.searchPlaceholder}
      />
      <CommandList>
        {loading ? (
          <div className="space-y-2 p-2" aria-label={labels.loading}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <>
            <CommandEmpty>{labels.noResults}</CommandEmpty>
            <CommandGroup>
              {results.map((o) => (
                <CommandItem key={o.id} value={o.id} onSelect={() => add(o.id)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      ids.includes(o.id) ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {def.avatars ? (
                    <FieldAvatar label={o.label} src={o.avatarUrl} className="mr-2 h-6 w-6" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.sublabel ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.sublabel}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );

  if (multiple) {
    return (
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input p-2">
        {ids.length === 0 ? (
          <span className="px-1 text-sm text-muted-foreground">
            {def.placeholder ?? labels.selectPlaceholder}
          </span>
        ) : null}
        {ids.map((id) => (
          <Chip
            key={id}
            label={cache[id]?.label ?? labels.loading}
            removeLabel={labels.remove(cache[id]?.label ?? id)}
            onRemove={() => remove(id)}
            disabled={def.disabled}
            leading={
              def.avatars ? (
                <FieldAvatar
                  label={cache[id]?.label ?? id}
                  src={cache[id]?.avatarUrl}
                  className="h-4 w-4"
                />
              ) : undefined
            }
          />
        ))}
        {!def.disabled && !atCapacity ? (
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setRawQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <FormControl>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  <Plus className="h-3 w-3" aria-hidden />
                  {labels.add}
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              {list}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    );
  }

  const selectedLabel = ids[0] ? (cache[ids[0]]?.label ?? labels.loading) : null;
  return (
    <div className="flex items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setRawQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={def.disabled}
              className={cn(
                "flex-1 justify-between font-normal",
                !selectedLabel && "text-muted-foreground",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {def.avatars && selectedLabel ? (
                  <FieldAvatar
                    label={selectedLabel}
                    src={ids[0] ? cache[ids[0]]?.avatarUrl : undefined}
                    className="h-5 w-5"
                  />
                ) : null}
                <span className="truncate">
                  {selectedLabel ?? def.placeholder ?? labels.selectPlaceholder}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          {list}
        </PopoverContent>
      </Popover>
      {selectedLabel && !def.disabled && !def.required ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.clear}
          onClick={() => remove(ids[0]!)}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

export function RelationField({ def, labels }: FieldInputProps<RelationFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => (
        <FieldShell def={def}>
          <RelationControl def={def} labels={labels} field={field} />
        </FieldShell>
      )}
    />
  );
}
