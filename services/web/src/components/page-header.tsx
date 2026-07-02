import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Standardized page header : `<h1>` + optional subtitle + optional
 * back affordance + a bottom `<Separator />`. Used by every detail
 * page (admin webhooks / roles / users / organizations + the
 * `/account/*` tabs) so the layout stays anchored at the same vertical
 * position regardless of whether a back button is present.
 *
 * The back link is rendered ABOVE the heading row on narrow viewports
 * (where there's no extra horizontal gutter) and absolutely-positioned
 * to the LEFT of the heading on wider screens (`xl+`) so it lives in
 * the page-layout gutter and doesn't push the title down. Pages
 * without a back link have their title pinned at the same top
 * position ; navigating between sibling pages no longer causes the
 * heading to shift down by ~16px.
 *
 * Heading hierarchy : always renders an `<h1>`. Pages that previously
 * emitted `CardTitle` (a `<div>`) for the page title now get a real
 * heading for screen readers and the typographic hierarchy.
 *
 * The bottom Separator is included by default so callers don't have
 * to remember it ; pass `withSeparator={false}` when the next block
 * already provides its own visual delimiter (e.g. a banner-style
 * profile section).
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

  return (
    <header className="space-y-4">
      <div className="relative space-y-1">
        {backHref && (
          <>
            {/*
              Wide-viewport variant : absolute-positioned in the
              left gutter so the title's vertical position doesn't
              shift when a back link is / isn't present.
            */}
            <Link
              href={backHref}
              aria-label={backLabel}
              className="absolute -left-10 top-0 hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
            {/*
              Narrow-viewport fallback : an inline link above the
              title. Keeps the affordance reachable when there's no
              gutter to absolutely-position into.
            */}
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground xl:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {backLabel}
            </Link>
          </>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className={cn(titleClass, "wrap-break-word")}>{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      {withSeparator && <Separator />}
    </header>
  );
}
