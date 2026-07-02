"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TIMES = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

export function TimePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        selectedRef.current?.scrollIntoView({ block: "center" });
      });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start gap-2 bg-transparent font-normal", className)}
        >
          <ClockIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{value || "—"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-32 p-0" align="start">
        <div className="max-h-56 overflow-y-auto py-1">
          {TIMES.map((t) => (
            <button
              key={t}
              ref={t === value ? selectedRef : undefined}
              type="button"
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                t === value &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
