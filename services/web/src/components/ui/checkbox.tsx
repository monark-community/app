"use client"

import * as React from "react"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Native `<input type="checkbox">` styled with the brand-primary
 * accent. Reasons we don't use the OS-native checkbox :
 *
 *  - The OS theme picks the box color (often blue) which clashes with
 *    the brand orange used elsewhere in the admin surfaces.
 *  - The OS-native indeterminate state renders a thin grey horizontal
 *    line that doesn't read as "partially selected" against the
 *    surrounding UI ; we want a solid primary box with a white minus
 *    icon, matching the checked state's visual weight.
 *
 * Implementation : the input itself drops `appearance-none`, gets a
 * primary border / fill via Tailwind classes, and we overlay a
 * `<Check>` or `<Minus>` icon (white-on-primary) when the box is
 * checked / indeterminate. The `indeterminate` prop is mirrored to
 * the DOM via `useEffect` since React doesn't expose it as a JSX
 * attribute. Forwarded refs still point at the underlying input so
 * existing imperative call sites keep working.
 */
type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  indeterminate?: boolean
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { className, indeterminate, checked, disabled, ...props },
    forwardedRef,
  ) {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    React.useImperativeHandle(forwardedRef, () => innerRef.current!)

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = Boolean(indeterminate)
      }
    }, [indeterminate])

    const filled = Boolean(checked) || Boolean(indeterminate)

    return (
      <span
        className={cn(
          "relative inline-flex h-5 w-5 shrink-0 items-center justify-center",
          disabled && "opacity-50",
        )}
      >
        <input
          ref={innerRef}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className={cn(
            "peer h-5 w-5 cursor-pointer appearance-none rounded-sm border bg-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed",
            filled
              ? "border-primary bg-primary"
              : "border-input hover:border-primary/60",
            className,
          )}
          {...props}
        />
        {/*
          Icon overlay : flex-centered absolute span lays the glyph
          dead-center inside the box on every browser. `inset-0 m-auto`
          relied on the SVG's intrinsic box being symmetric, which
          Lucide's stroke offsets don't always honour ; a flex centerer
          gives a pixel-perfect visual.
        */}
        {indeterminate || checked ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {indeterminate ? (
              <Minus className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />
            )}
          </span>
        ) : null}
      </span>
    )
  },
)
