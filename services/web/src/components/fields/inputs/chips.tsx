"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "../types";

/**
 * A removable value chip, shared by the multi-select and relation
 * fields. Mirrors the badge-with-remove pattern used across the app.
 * `tone` colors the badge (multi-select badge mode) ; `leading` renders
 * before the label (relation avatar).
 */
export function Chip({
  label,
  onRemove,
  removeLabel,
  disabled,
  tone,
  leading,
}: {
  label: string;
  onRemove: () => void;
  removeLabel: string;
  disabled?: boolean;
  tone?: BadgeTone;
  leading?: ReactNode;
}) {
  return (
    <Badge variant={tone ?? "secondary"} className="max-w-full gap-1 pl-1.5 pr-1">
      {leading}
      <span className="truncate">{label}</span>
      {disabled ? null : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-foreground/10"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </Badge>
  );
}
