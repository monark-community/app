"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * On/off switch styled with the brand-primary track. Used in
 * preference-style settings where the binary is the whole control
 * (e.g. "Endpoint enabled"). Implemented as a `<button role="switch">`
 * with native focus/keyboard support ; no Radix dep needed.
 *
 * The white thumb slides via `translate-x` rather than a
 * left/right swap so the transition is GPU-cheap and stays smooth in
 * long lists.
 */
type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "type" | "role" | "value"
> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    { checked = false, onCheckedChange, disabled, className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted",
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    )
  },
)
