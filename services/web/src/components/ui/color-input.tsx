"use client";

import { useState } from "react";
import { Eraser, Pipette } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { ColorPicker } from "@/components/ui/color-picker";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True for a complete 3- or 6-digit hex string (e.g. `#f0870c`, `#abc`). */
export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/**
 * Standard color input: a swatch that opens the full {@link ColorPicker} in a
 * popover, next to an editable hex field (type / paste). Controlled — `value`
 * is the raw hex string (`""` = unset), and `onChange` fires on both a picker
 * save and a text edit. The parent decides how to validate / normalize on save.
 *
 * An unset (or not yet valid) value shows as a pipette ("pick a color")
 * rather than a fake
 * color, so "no color" never reads as white. `clearable` adds a "No color"
 * action to the picker for fields where unset is a meaningful choice (it
 * falls back to a default, or means "automatic").
 *
 * Use this for every "pick a color" affordance (Calendars, Roles, Organizations)
 * so they share one look and behaviour.
 */
export function ColorInput({
  value,
  onChange,
  id,
  placeholder = "#000000",
  disabled = false,
  defaultColor = "#6366f1",
  swatchOnly = false,
  clearable = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Seeds the picker when the current value is empty / not a valid hex. */
  defaultColor?: string;
  /** Hide the hex text field (swatch + picker only). */
  swatchOnly?: boolean;
  /** Offer a "No color" action in the picker that sets the value to `""`. */
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const valid = isHexColor(value);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <PopoverTrigger asChild>
          {valid ? (
            <ColorSwatch
              hex={value}
              size="h-9 w-9"
              disabled={disabled}
              aria-label={ariaLabel ?? tc("chooseColor")}
              aria-haspopup="dialog"
              className={cn(disabled && "cursor-not-allowed opacity-50")}
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              aria-label={`${ariaLabel ?? tc("chooseColor")} (${tc("noColor")})`}
              aria-haspopup="dialog"
              className={cn(
                "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-dashed border-input bg-muted text-muted-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Pipette aria-hidden className="size-4" />
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <ColorPicker
            value={valid ? value : defaultColor}
            saveLabel={tc("save")}
            cancelLabel={tc("cancel")}
            onSave={(hex) => {
              onChange(hex);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
          {clearable && (
            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Eraser aria-hidden className="size-3.5" />
              {tc("noColor")}
            </button>
          )}
        </PopoverContent>
      </Popover>
      {!swatchOnly && (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
          spellCheck={false}
          aria-invalid={value !== "" && !valid}
        />
      )}
    </div>
  );
}
