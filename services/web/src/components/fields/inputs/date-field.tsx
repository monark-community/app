"use client";

import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FormControl, FormField } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { FieldShell } from "../field-shell";
import type { DateFieldDef, DatetimeFieldDef, FieldInputProps } from "../types";

function formatValue(date: Date, withTime: boolean): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function timeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0",
  )}`;
}

/** Apply "HH:MM" onto a date (cloning it). */
function withTimeApplied(base: Date, time: string): Date {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const next = new Date(base);
  next.setHours(h ?? 0, m ?? 0, 0, 0);
  return next;
}

/** Copy y/m/d from `picked` onto `base`, preserving `base`'s time. */
function withDateApplied(base: Date | null, picked: Date): Date {
  const next = base ? new Date(base) : new Date(picked);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  if (!base) next.setHours(0, 0, 0, 0);
  return next;
}

function DateFieldBase({
  def,
  labels,
  withTime,
}: {
  def: DateFieldDef | DatetimeFieldDef;
  labels: FieldInputProps["labels"];
  withTime: boolean;
}) {
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => {
        const value = (field.value as Date | null) ?? null;
        return (
          <FieldShell def={def}>
            <div className="flex items-center gap-1">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={def.disabled}
                      className={cn(
                        "flex-1 justify-start gap-2 font-normal",
                        !value && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      {value ? formatValue(value, withTime) : labels.pickDate}
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    autoFocus
                    selected={value ?? undefined}
                    disabled={[
                      ...(def.min ? [{ before: def.min }] : []),
                      ...(def.max ? [{ after: def.max }] : []),
                    ]}
                    onSelect={(picked) => {
                      if (!picked) {
                        field.onChange(null);
                        return;
                      }
                      field.onChange(withDateApplied(value, picked));
                      if (!withTime) setOpen(false);
                    }}
                  />
                  {withTime ? (
                    <div className="border-t border-border p-3">
                      <TimePicker
                        value={value ? timeString(value) : "00:00"}
                        onChange={(time) =>
                          field.onChange(withTimeApplied(value ?? new Date(), time))
                        }
                      />
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
              {value && !def.disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.clear}
                  onClick={() => field.onChange(null)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          </FieldShell>
        );
      }}
    />
  );
}

export function DateField({ def, labels }: FieldInputProps<DateFieldDef>) {
  return <DateFieldBase def={def} labels={labels} withTime={false} />;
}

export function DatetimeField({ def, labels }: FieldInputProps<DatetimeFieldDef>) {
  return <DateFieldBase def={def} labels={labels} withTime />;
}
