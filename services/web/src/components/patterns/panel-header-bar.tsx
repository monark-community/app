"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronsRight, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * Sticky controls bar at the top of a detail side-panel: a collapse
 * button and an optional "open full page" link. Sized to `h-14` so its
 * bottom border lines up with the global appbar's for a clean seam
 * between the panel and the chrome behind it.
 *
 * On mobile the panel is already presented full-screen, so the
 * "open full page" link is suppressed — following it would navigate to an
 * equivalent view at a worse cost.
 *
 * Text-free: pass the (already-translated) accessible labels in. Extra
 * trailing controls can be dropped in via `children`.
 */
export function PanelHeaderBar({
  onCollapse,
  collapseLabel,
  fullPageHref,
  fullPageLabel,
  children,
  className,
}: {
  onCollapse: () => void;
  collapseLabel: string;
  fullPageHref?: string;
  fullPageLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center justify-start gap-1 border-b border-border px-3",
        className,
      )}
    >
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCollapse}>
        <ChevronsRight className="h-4 w-4" aria-hidden />
        <span className="sr-only">{collapseLabel}</span>
      </Button>
      {fullPageHref && !isMobile && (
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={fullPageHref}>
            <Maximize2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">{fullPageLabel}</span>
          </Link>
        </Button>
      )}
      {children}
    </div>
  );
}
