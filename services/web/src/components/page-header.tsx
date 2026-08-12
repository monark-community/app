"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSectionDetailHeader } from "@/components/section-shell";
import { cn } from "@/lib/utils";

/**
 * Standardized page header : `<h1>` + optional subtitle + optional
 * back affordance + a bottom `<Separator />`. Used by every detail
 * page (admin webhooks / roles / users / organizations + the
 * `/account/*` tabs) so the layout stays anchored at the same vertical
 * position regardless of whether a back button is present.
 *
 * The back link is absolutely-positioned to the LEFT of the heading on
 * `xl+` (in the section shell's content gutter) so it doesn't push the
 * title down. Below `xl` there's no second copy here — when `backHref`
 * is set, this registers with the nearest `SectionShell` (see
 * `useSectionDetailHeader`) so the *same* back link + title appear in
 * the section's scroll-linked mobile chrome instead, and this inline
 * `<h1>` goes `sr-only` at that breakpoint (still in the accessibility
 * tree — heading hierarchy is unaffected — just visually deduplicated
 * against the chrome). `subtitle` / `action` have no chrome equivalent,
 * so they stay visible inline at every breakpoint. Pages with no
 * `backHref` have no chrome replacement, so their title stays visible
 * inline everywhere too.
 *
 * The bottom Separator is included by default so callers don't have
 * to remember it ; pass `withSeparator={false}` when the next block
 * already provides its own visual delimiter (e.g. a banner-style
 * profile section). It's also hidden below `xl` whenever `backHref` is
 * set : the chrome detail bar's own `border-b` already divides it from
 * the content, so a second one right after the (now sr-only) title
 * would just be dead space with a stray rule in it. Every spacing
 * wrapper here uses flex `gap`, not `space-y` — `space-y`'s sibling-
 * margin trick only checks the HTML `hidden` attribute, not a `hidden`
 * *class* (`display: none`) or `sr-only`'s `position: absolute`, so it
 * would otherwise leave a phantom gap around either.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
  tone = "default",
  withSeparator = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Header-row right slot for a primary action button or status badge. */
  action?: ReactNode;
  tone?: "default" | "danger";
  withSeparator?: boolean;
}) {
  const titleClass =
    tone === "danger"
      ? "text-2xl font-semibold tracking-tight text-destructive"
      : "text-2xl font-semibold tracking-tight";

  useSectionDetailHeader(backHref ? { title, backHref, backLabel: backLabel ?? "" } : null);

  return (
    <header className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-1">
        {backHref && (
          // `xl+` only : the section shell's mobile detail bar carries the
          // same back link below `xl` (see the doc comment above).
          <Link
            href={backHref}
            aria-label={backLabel}
            className="absolute -left-10 top-0 hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className={cn(titleClass, "wrap-break-word", backHref && "sr-only xl:not-sr-only")}>
              {title}
            </h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      {withSeparator && <Separator className={cn(backHref && "hidden xl:block")} />}
    </header>
  );
}
