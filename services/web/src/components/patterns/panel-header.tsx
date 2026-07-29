"use client";

import { type ComponentType, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, MoreHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { fitVisibleCount } from "./overflow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** An icon-button action rendered on the right of a {@link PanelHeader}. When
 *  the actions don't fit the panel width they collapse into an "…" menu. */
export interface PanelHeaderAction {
  icon: ComponentType<{ className?: string }>;
  /** Accessible name (icon-button aria-label + overflow-menu item text). */
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

/** Optional left-side control : `back` shows a single back arrow. (The
 *  open-full-page control lives on the right, next to close — see
 *  `fullPageHref`.) */
export type PanelHeaderLeft = { mode: "back"; onBack: () => void; label: string };

// Rough fixed widths (px) used to estimate how many action buttons fit — the
// buttons are all fixed-size icon buttons, so an estimate is enough and avoids
// a per-item measuring pass.
const BTN = 34; // icon button (32px) + gap
const TITLE_MIN = 96; // keep the title at least this readable before collapsing
const PAD = 16; // horizontal padding of the header

/**
 * Standard header for a right-side panel (detail form, notifications, apps,
 * user menu). Fixed height matching the appbar, so its bottom border continues
 * the appbar's seam. Layout: optional left controls · title (+ optional
 * subtitle, stacked, no height impact) · right-aligned icon actions that
 * overflow into an "…" menu based on the measured panel width, with a close
 * button always pinned as the right-most action.
 *
 * Text-free except the universal close / more labels, which come from the
 * shared `common` namespace ; pass the (already-translated) title, subtitle,
 * and per-action labels in.
 */
export function PanelHeader({
  title,
  subtitle,
  onClose,
  left,
  fullPageHref,
  fullPageLabel,
  actions = [],
  maxVisibleActions = 3,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  left?: PanelHeaderLeft;
  /** When set, an open-full-page link icon renders on the right, just left of
   *  the close button. */
  fullPageHref?: string;
  /** Accessible name for the open-full-page link (required with `fullPageHref`). */
  fullPageLabel?: string;
  actions?: PanelHeaderAction[];
  /** Hard cap on visible action buttons regardless of width. Default 3. */
  maxVisibleActions?: number;
  className?: string;
}) {
  const tc = useTranslations("common");
  const rootRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(actions.length);

  const leftButtons = left?.mode === "back" ? 1 : 0;
  // Right-side fixed controls that always show (never overflow): the
  // open-full-page link (optional) + the close button.
  const rightFixedButtons = 1 + (fullPageHref ? 1 : 0);

  // Fit as many action buttons as the measured width allows (capped), the rest
  // collapse into "…". Re-measures on panel resize via ResizeObserver.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const compute = () => {
      const reserved = PAD + leftButtons * BTN + TITLE_MIN + rightFixedButtons * BTN;
      setVisibleCount(
        fitVisibleCount(el.clientWidth - reserved, BTN, actions.length, maxVisibleActions),
      );
    };
    compute();
    // ResizeObserver is absent in jsdom / older SSR contexts ; the one-shot
    // compute above is enough there.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [actions.length, maxVisibleActions, leftButtons, rightFixedButtons]);

  const visible = actions.slice(0, visibleCount);
  const overflow = actions.slice(visibleCount);

  return (
    <div
      ref={rootRef}
      className={cn(
        // 57px = appbar's h-14 row + its 1px border, so the bottom borders align.
        "flex h-[57px] shrink-0 items-center gap-1 border-b border-border px-2",
        className,
      )}
    >
      {left?.mode === "back" && (
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={left.onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="sr-only">{left.label}</span>
        </Button>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center px-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{title}</p>
        {subtitle && (
          <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {visible.map((a, i) => {
          const Icon = a.icon;
          return (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", a.destructive && "text-destructive hover:text-destructive")}
              disabled={a.disabled}
              onClick={a.onSelect}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="sr-only">{a.label}</span>
            </Button>
          );
        })}

        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tc("more")}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflow.map((a, i) => {
                const Icon = a.icon;
                return (
                  <DropdownMenuItem
                    key={i}
                    disabled={a.disabled}
                    onSelect={a.onSelect}
                    className={cn(a.destructive && "text-destructive focus:text-destructive")}
                  >
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    {a.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {fullPageHref && (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={fullPageHref}>
              <Maximize2 className="h-4 w-4" aria-hidden />
              <span className="sr-only">{fullPageLabel}</span>
            </Link>
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label={tc("close")}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
