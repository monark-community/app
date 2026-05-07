import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Shared layout primitive for "card-less" page sections. Replaces the
 * `<Card><CardHeader><CardTitle>…</CardTitle><CardDescription>…</CardDescription></CardHeader><CardContent>…</CardContent></Card>`
 * shape that was being used for every section across the admin and
 * account surfaces — those Card wrappers came with extra borders / box
 * shadows, made the surfaces feel "boxy", AND emitted the title as a
 * `<div>` instead of a real heading. `PageSection` keeps the visual
 * intent (one block of titled content) while landing a proper `<h2>`
 * for screen readers + the rest of the heading hierarchy.
 *
 * The intended use is :
 *
 *   <h1>Page title</h1>
 *   <p>page subtitle</p>
 *
 *   <PageSection title="…" subtitle="…">… content …</PageSection>
 *   <Separator />
 *   <PageSection title="…">… content …</PageSection>
 *
 * Action slot is for header-row affordances (a primary button, a
 * status badge) so callers don't have to lay out their own
 * flex container around the heading. Tone variants pin the title's
 * accent color so danger / warning sections stand out without
 * needing a re-bordered card.
 */
export type PageSectionTone = "default" | "danger" | "warning"

const TITLE_TONE_CLASSES: Record<PageSectionTone, string> = {
  default: "",
  danger: "text-destructive",
  warning: "text-amber-500",
}

export function PageSection({
  title,
  subtitle,
  action,
  tone = "default",
  children,
  className,
  contentClassName,
  id,
  titleId,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Header-row right slot ; primary button, badge, etc. */
  action?: ReactNode
  tone?: PageSectionTone
  children: ReactNode
  className?: string
  /** Override the inner content wrapper's spacing if the default
   * (`space-y-4`) doesn't fit (e.g. a fieldset that owns its own
   * gap). Pass empty string for no spacing. */
  contentClassName?: string
  id?: string
  titleId?: string
}) {
  return (
    <section id={id} className={cn("space-y-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            id={titleId}
            className={cn(
              "text-base font-semibold leading-tight tracking-tight",
              TITLE_TONE_CLASSES[tone],
            )}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn(contentClassName ?? "space-y-4")}>{children}</div>
    </section>
  )
}
