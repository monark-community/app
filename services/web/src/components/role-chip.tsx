import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Role label rendered as a small pill with the role's `color` driving
 * a tinted background + matching dot. When `color` is null, falls back
 * to a neutral muted style so the layout still reads as a chip — a
 * dim label is preferable to a missing one.
 *
 * `color` is a hex string (`#RGB` or `#RRGGBB`) ; the `style` prop
 * carries it as a custom property the inline styles consume. We don't
 * try to compute readable contrast — operators pick saturated brand
 * tones and the chip stays readable on light + dark themes via the
 * `15%` alpha background. The text colour stays foreground-anchored.
 *
 * Optional `onRemove` renders a small X-icon button at the end of the
 * pill ; clicking it triggers the callback (used by the user-detail
 * roles list to revoke an assignment in a single click). The button
 * sits inside the chip so it inherits the tinted background ; pass
 * `removeAriaLabel` so screen readers announce *which* role the
 * remove targets.
 */
export function RoleChip({
  name,
  color,
  className,
  onRemove,
  removeAriaLabel,
  removeDisabled,
}: {
  name: string
  color: string | null | undefined
  className?: string
  onRemove?: () => void
  removeAriaLabel?: string
  removeDisabled?: boolean
}) {
  const tint = color
    ? {
        // Soft fill tinted by the role colour so the pill reads as
        // labelled-by-role without overpowering the row.
        backgroundColor: `${color}26`,
        // Dot sits at full saturation as the obvious carrier of the
        // hue ; the chip background stays muted.
        color,
      }
    : undefined
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        color ? "" : "bg-muted text-muted-foreground",
        className,
      )}
      style={tint}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          color ? "" : "bg-muted-foreground",
        )}
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="text-foreground">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          aria-label={removeAriaLabel}
          className="-mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  )
}
