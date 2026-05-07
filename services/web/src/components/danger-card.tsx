import type { ReactNode } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type DangerCardTone = "danger" | "warning"

const TONE_BORDER: Record<DangerCardTone, string> = {
  danger: "border-destructive/40",
  warning: "border-amber-400/40",
}

const TONE_TITLE: Record<DangerCardTone, string> = {
  danger: "text-destructive",
  warning: "text-amber-500",
}

/**
 * Card-bordered "Danger Zone" wrapper used for irreversible actions on
 * detail pages : `/account/danger`, `/admin/users/[id]`, the webhook
 * editor's rotate-secret + delete-endpoint pair, and so on.
 *
 * The rest of those pages use the card-less PageSection + Separator
 * pattern, so wrapping the destructive surface in a real Card is what
 * gives it visual weight ; the destructive border + tinted title carry
 * the warning without needing ALL-CAPS or an icon-heavy layout.
 *
 * Tone variants : `danger` (default ; red border + title) for delete /
 * rotate / hard-delete affordances, `warning` (amber border + title)
 * for the in-grace cancellation surface where the action is
 * recoverable.
 *
 * Compose with `<DangerRow>` for each action so the text-on-left,
 * action-on-right alignment stays uniform across pages.
 */
export function DangerCard({
  title,
  subtitle,
  tone = "danger",
  children,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  tone?: DangerCardTone
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={`${TONE_BORDER[tone]} ${className ?? ""}`}>
      <CardHeader>
        <CardTitle className={TONE_TITLE[tone]}>{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/**
 * Single row inside a `<DangerCard>` : title + description on the left,
 * action button(s) on the right. Stacks vertically on narrow viewports
 * so the button never gets cropped.
 */
export function DangerRow({
  title,
  description,
  action,
}: {
  title: ReactNode
  description: ReactNode
  action: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
