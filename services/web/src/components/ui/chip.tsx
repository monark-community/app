"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** Colour tone of a chip (mirrors the Badge variants). */
export type ChipTone = NonNullable<BadgeProps["variant"]>;

/**
 * A value chip : optional `leading` content (icon / avatar / colour dot), a
 * label, and an optional remove `×`. Removable when `onRemove` is set and not
 * `disabled` ; otherwise it's a static pill. When `href` is set the label
 * becomes a link (opening in a new tab with `hrefNewTab`, so following it from
 * inside an unsaved form never discards it). Shared by the multi-select and
 * relation inputs and anywhere a token/tag is shown.
 */
export function Chip({
  label,
  leading,
  href,
  hrefNewTab,
  onRemove,
  removeLabel,
  disabled,
  tone,
  title,
  className,
}: {
  label: ReactNode;
  leading?: ReactNode;
  /** When set, the label renders as a link to this href. */
  href?: string;
  /** Open the label link in a new tab (`target="_blank"`). */
  hrefNewTab?: boolean;
  /** When set (and not disabled) renders the remove × button. */
  onRemove?: () => void;
  /** aria-label for the × button (required when `onRemove` is set). */
  removeLabel?: string;
  disabled?: boolean;
  tone?: ChipTone;
  /** Native tooltip on the chip, for explaining a non-obvious state. */
  title?: string;
  className?: string;
}) {
  const removable = !!onRemove && !disabled;
  const labelNode =
    href && !disabled ? (
      <Link
        href={href}
        target={hrefNewTab ? "_blank" : undefined}
        rel={hrefNewTab ? "noreferrer" : undefined}
        className="truncate rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {label}
      </Link>
    ) : (
      <span className="truncate">{label}</span>
    );
  return (
    <Badge
      variant={tone ?? "secondary"}
      title={title}
      className={cn("max-w-full gap-1", removable ? "pl-1.5 pr-1" : "px-2", className)}
    >
      {leading}
      {labelNode}
      {removable && (
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

/**
 * The dashed "add new" affordance that sits alongside chips (and is the whole
 * empty-state when there are no chips yet). Generalizes the inline dashed
 * button used in the admin users roles editor.
 */
export function AddChip({
  label,
  onClick,
  disabled,
  icon: Icon = Plus,
  className,
}: {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors",
        "hover:border-foreground/40 hover:text-foreground",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

/**
 * Bordered, wrapping container that holds a row of {@link Chip}s plus an add
 * affordance — the box shell shared by the multi-select / token inputs.
 */
export function ChipList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
