"use client";

import { useState } from "react";
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
          <ColorSwatch
            hex={valid ? value : "#ffffff"}
            size="h-9 w-9"
            disabled={disabled}
            aria-label={ariaLabel ?? tc("chooseColor")}
            aria-haspopup="dialog"
            className={cn(!valid && "border-dashed", disabled && "cursor-not-allowed opacity-50")}
          />
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
