import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Status / label pill primitive used across the admin + account
 * surfaces. Replaces ~a-dozen ad-hoc styled `<span>`s scattered
 * across the codebase (webhook status / failing pills, permissions-
 * locked, user badges, etc.) so the visual treatment of "this row
 * has a state" stays uniform.
 *
 * Two size flavours :
 *  - `default` : 12px text, sentence-case ; the usual identity-row
 *    pill ("Disabled", "Pending deletion") that pairs with an icon.
 *  - `sm` : 10px uppercase + tracking-wide ; the chip-of-state read
 *    used inside list rows and card chrome ("ACTIVE", "FAILING",
 *    "LOCKED") where the surrounding type is already small.
 *
 * Tone variants mirror the other primary/secondary/success/warning/
 * destructive split used elsewhere ; the alpha-tinted background +
 * solid foreground keeps the pill readable on both light + dark
 * themes without per-mode rules.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-primary/10 text-primary",
        secondary: "bg-muted text-muted-foreground",
        success:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        warning:
          "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        destructive:
          "bg-destructive/10 text-destructive",
        outline: "border border-border text-foreground",
      },
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
)

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { badgeVariants }
