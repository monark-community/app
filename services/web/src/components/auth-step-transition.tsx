"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Long enough to read as a transition, short enough not to feel like a
 *  wait. The fade out and the fade in each take this ; the height eases
 *  over the same span so the two land together. */
const FADE_MS = 140;

/**
 * Crossfades between steps inside an auth card while the card's height
 * eases to fit whatever is arriving.
 *
 * The card itself never unmounts, which is the point: sign-in reads as
 * one surface changing its mind rather than two screens swapping. Only
 * the content inside it fades.
 *
 * How the swap works. `stepKey` changing starts a fade-out on the
 * *current* content, which is held frozen in a ref so it can't
 * re-render mid-fade. After `FADE_MS` the new children take over and
 * fade back in. Height is measured off the live content with a
 * `ResizeObserver` and applied to the wrapper, so the box eases from one
 * size to the next instead of jumping.
 *
 * Two details that are easy to get wrong:
 *
 * - **Overflow is only hidden while moving.** Clipping permanently would
 *   cut off focus rings on the outer edges of inputs, which matters more
 *   than the animation does.
 * - **First paint doesn't animate.** Height starts `undefined` (so
 *   `auto`) and is only measured after mount ; without that the card
 *   visibly grows from zero on load.
 *
 * Honours `prefers-reduced-motion` by dropping both transitions ; the
 * content still swaps, just instantly.
 */
export function AuthStepTransition({
  stepKey,
  children,
  className,
}: {
  /** Changing this triggers the crossfade. */
  stepKey: string;
  children: ReactNode;
  className?: string;
}) {
  const [displayKey, setDisplayKey] = useState(stepKey);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const innerRef = useRef<HTMLDivElement>(null);

  // Snapshot of what's on screen. While a swap is in flight this holds
  // the outgoing content so it stays put for the fade instead of
  // re-rendering as the new step.
  const shown = useRef<ReactNode>(children);
  const swapping = displayKey !== stepKey;
  if (!swapping) shown.current = children;

  // Measure the live content, not the wrapper : the wrapper is the thing
  // being animated, so reading its height would feed back on itself.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayKey]);

  useEffect(() => {
    if (!swapping) return;
    const timer = setTimeout(() => setDisplayKey(stepKey), FADE_MS);
    return () => clearTimeout(timer);
  }, [swapping, stepKey]);

  return (
    <div
      className={cn(
        "transition-[height] duration-200 ease-out motion-reduce:transition-none",
        swapping && "overflow-hidden",
        className,
      )}
      style={{ height }}
    >
      <div
        ref={innerRef}
        aria-busy={swapping || undefined}
        className={cn(
          "transition-opacity ease-out motion-reduce:transition-none",
          swapping ? "opacity-0" : "opacity-100",
        )}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        {swapping ? shown.current : children}
      </div>
    </div>
  );
}
