"use client";

import { useCurrentTime } from "../hooks/use-current-time";
import { TOTAL_HEIGHT_PX } from "../constants";

export function CurrentTimeIndicator() {
  const { totalMinutes } = useCurrentTime();
  const top = (totalMinutes / (24 * 60)) * TOTAL_HEIGHT_PX;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top }}
      aria-hidden
    >
      <div
        className="shrink-0"
        style={{
          width: 0,
          height: 0,
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderLeft: "10px solid hsl(var(--primary))",
        }}
      />
      <div className="h-px flex-1 bg-primary" />
    </div>
  );
}
