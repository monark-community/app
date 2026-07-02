"use client";

import { cn } from "@/lib/utils";
import { hexToRgb, formatColor, type ColorFormat } from "@/lib/color-utils";

// ── Checker background (transparency indicator) ─────────────────

export const checkerBg = `linear-gradient(45deg, hsl(0 0% 50% / 0.15) 25%, transparent 25%),linear-gradient(-45deg, hsl(0 0% 50% / 0.15) 25%, transparent 25%),linear-gradient(45deg, transparent 75%, hsl(0 0% 50% / 0.15) 75%),linear-gradient(-45deg, transparent 75%, hsl(0 0% 50% / 0.15) 75%)`;
export const checkerSize = "8px 8px";
export const checkerPosition = "0 0, 0 4px, 4px -4px, -4px 0";

// ── Gradient types ──────────────────────────────────────────────

export type GradientType = "solid" | "linear" | "radial" | "angular";

export interface GradientStop {
  id: string;
  color: string;
  position: number;
  opacity: number;
}

export interface GradientValue {
  type: GradientType;
  angle: number;
  stops: GradientStop[];
}

export function gradientToCss(g: GradientValue): string {
  const stopsCss = [...g.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const { r, g: gr, b } = hexToRgb(s.color);
      return `rgba(${r}, ${gr}, ${b}, ${s.opacity / 100}) ${s.position}%`;
    })
    .join(", ");
  switch (g.type) {
    case "linear":
      return `linear-gradient(${g.angle}deg, ${stopsCss})`;
    case "radial":
      return `radial-gradient(circle, ${stopsCss})`;
    case "angular":
      return `conic-gradient(from ${g.angle}deg, ${stopsCss})`;
    default:
      return g.stops[0]?.color ?? "#000000";
  }
}

// ── ColorSwatch ─────────────────────────────────────────────────

export function ColorSwatch({
  hex,
  opacity = 100,
  gradient,
  size = "size-6",
  className,
  ...props
}: {
  hex: string;
  opacity?: number;
  gradient?: GradientValue;
  size?: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  if (gradient && gradient.type !== "solid")
    return (
      <button
        className={cn(size, "rounded shrink-0 overflow-hidden", className)}
        style={{
          backgroundImage: checkerBg,
          backgroundSize: checkerSize,
          backgroundPosition: checkerPosition,
        }}
        {...props}
      >
        <div className="w-full h-full rounded" style={{ background: gradientToCss(gradient) }} />
      </button>
    );
  if (opacity >= 100)
    return (
      <button
        className={cn(size, "rounded shrink-0 border border-input cursor-pointer", className)}
        style={{ background: hex }}
        {...props}
      />
    );
  return (
    <button
      className={cn(
        size,
        "rounded shrink-0 overflow-hidden flex border border-input cursor-pointer",
        className,
      )}
      style={{
        backgroundImage: checkerBg,
        backgroundSize: checkerSize,
        backgroundPosition: checkerPosition,
      }}
      {...props}
    >
      <div className="w-1/2 h-full" style={{ background: hex }} />
      <div className="w-1/2 h-full" style={{ background: hex, opacity: opacity / 100 }} />
    </button>
  );
}

// ── ColorValue — swatch + formatted color code ──────────────────

export function ColorValue({
  hex,
  opacity = 100,
  format = "hex",
  gradient,
  className,
}: {
  hex: string;
  opacity?: number;
  format?: ColorFormat;
  gradient?: GradientValue;
  className?: string;
}) {
  if (!hex && !gradient)
    return <div className={cn("size-6 rounded border border-dashed shrink-0", className)} />;
  const isGrad = gradient && gradient.type !== "solid";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ColorSwatch hex={hex} opacity={opacity} gradient={gradient} className="cursor-default" />
      {isGrad ? (
        <span className="text-xs text-muted-foreground truncate capitalize">
          {gradient.type} · {gradient.stops.length} stops
        </span>
      ) : (
        <>
          <span className="text-xs font-mono text-muted-foreground truncate">
            {formatColor(hex, format)}
          </span>
          {opacity < 100 && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{opacity}%</span>
          )}
        </>
      )}
    </div>
  );
}
