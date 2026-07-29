"use client";

import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatValue(date: Date): string {
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Controlled, date-only date picker : a trigger button showing the chosen day
 * (or a placeholder) that opens a {@link Calendar} popover, plus a clear button.
 * The plain-`useState` sibling of the RHF-bound field-toolkit `DateField` — same
 * look, no form context — for controlled forms (e.g. the kanban card editor).
 * Text-free : pass already-translated `placeholder` / `clearLabel`.
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  clearLabel,
  disabled,
  id,
  min,
  max,
  align = "start",
  className,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder: string;
  clearLabel: string;
  disabled?: boolean;
  id?: string;
  /** Disallow days before this date. */
  min?: Date;
  /** Disallow days after this date. */
  max?: Date;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "flex-1 justify-start gap-2 font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {value ? formatValue(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="single"
            autoFocus
            selected={value ?? undefined}
            disabled={[...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])]}
            onSelect={(picked) => {
              onChange(picked ?? null);
              if (picked) setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={clearLabel}
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
