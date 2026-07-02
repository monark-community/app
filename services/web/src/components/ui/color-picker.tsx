"use client";

import { useCallback, useRef, useState, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PlusIcon, MinusIcon } from "lucide-react";
import { hexToRgb, hexToHsl, hexToCmyk, type ColorFormat } from "@/lib/color-utils";
import {
  ColorSwatch,
  gradientToCss,
  checkerBg,
  checkerSize,
  checkerPosition,
  type GradientType,
  type GradientStop,
  type GradientValue,
} from "@/components/ui/color-swatch";

// ── Conversion helpers ───────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100,
    ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}
function cmykToHex(c: number, m: number, y: number, k: number): string {
  return rgbToHex(
    Math.round(255 * (1 - c / 100) * (1 - k / 100)),
    Math.round(255 * (1 - m / 100) * (1 - k / 100)),
    Math.round(255 * (1 - y / 100) * (1 - k / 100)),
  );
}
function hsbToHex(h: number, s: number, b: number): string {
  const l = b * (1 - s / 200);
  const sl = l === 0 || l === 100 ? 0 : ((b - l) / Math.min(l, 100 - l)) * 100;
  return hslToHex(h, sl, l);
}
function hexToHsb(hex: string): { h: number; s: number; b: number } {
  const { h, s, l } = hexToHsl(hex);
  const b = l + (s * Math.min(l, 100 - l)) / 100;
  const sb = b === 0 ? 0 : 200 * (1 - l / b);
  return { h, s: isNaN(sb) ? 0 : sb, b };
}

function makeId() {
  return Math.random().toString(36).slice(2, 8);
}
function defaultGradient(hex = "#000000"): GradientValue {
  return {
    type: "linear",
    angle: 90,
    stops: [
      { id: makeId(), color: hex, position: 0, opacity: 100 },
      { id: makeId(), color: "#ffffff", position: 100, opacity: 100 },
    ],
  };
}

// ── Subcomponents ────────────────────────────────────────────────

const STEP = 1;
const LARGE_STEP = 5;

function SatBrightCanvas({
  hue,
  saturation,
  brightness,
  onChange,
}: {
  hue: number;
  saturation: number;
  brightness: number;
  onChange: (s: number, b: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const update = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = ref.current!.getBoundingClientRect();
      onChange(
        clamp((e.clientX - rect.left) / rect.width, 0, 1) * 100,
        (1 - clamp((e.clientY - rect.top) / rect.height, 0, 1)) * 100,
      );
    },
    [onChange],
  );
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? LARGE_STEP : STEP;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(clamp(saturation + step, 0, 100), brightness);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(clamp(saturation - step, 0, 100), brightness);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onChange(saturation, clamp(brightness + step, 0, 100));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onChange(saturation, clamp(brightness - step, 0, 100));
    }
  }
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label="Saturation and brightness"
      aria-valuenow={Math.round(saturation)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`Saturation ${Math.round(saturation)}%, Brightness ${Math.round(brightness)}%`}
      className="relative h-40 rounded-md cursor-crosshair select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => dragging.current && update(e)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute size-3.5 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${saturation}%`, top: `${100 - brightness}%` }}
      />
    </div>
  );
}

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const update = useCallback(
    (e: { clientX: number }) => {
      onChange(
        clamp(
          (e.clientX - ref.current!.getBoundingClientRect().left) /
            ref.current!.getBoundingClientRect().width,
          0,
          1,
        ) * 360,
      );
    },
    [onChange],
  );
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? LARGE_STEP * 3.6 : STEP * 3.6;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(clamp(hue + step, 0, 360));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(clamp(hue - step, 0, 360));
    }
  }
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      className="relative h-3 rounded-full cursor-pointer select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
      style={{
        background:
          "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => dragging.current && update(e)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute top-1/2 size-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${(hue / 360) * 100}%`, background: `hsl(${hue}, 100%, 50%)` }}
      />
    </div>
  );
}

function OpacitySlider({
  hex,
  opacity,
  onChange,
}: {
  hex: string;
  opacity: number;
  onChange: (o: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const update = useCallback(
    (e: { clientX: number }) => {
      onChange(
        Math.round(
          clamp(
            (e.clientX - ref.current!.getBoundingClientRect().left) /
              ref.current!.getBoundingClientRect().width,
            0,
            1,
          ) * 100,
        ),
      );
    },
    [onChange],
  );
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? LARGE_STEP : STEP;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(clamp(opacity + step, 0, 100));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(clamp(opacity - step, 0, 100));
    }
  }
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label="Opacity"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={opacity}
      className="relative h-3 rounded-full cursor-pointer select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
      style={{
        backgroundImage: checkerBg,
        backgroundSize: checkerSize,
        backgroundPosition: checkerPosition,
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => dragging.current && update(e)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `linear-gradient(to right, transparent, ${hex})` }}
      />
      <div
        className="absolute top-1/2 size-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${opacity}%`, background: hex, opacity: opacity / 100 }}
      />
    </div>
  );
}

function DraftNumberInput({
  value,
  max,
  onChange,
  className,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseInt(e.target.value);
        if (!isNaN(n)) onChange(clamp(n, 0, max));
      }}
      onFocus={() => setDraft(String(value))}
      onBlur={() => setDraft(null)}
      className={className}
    />
  );
}

function GradientStopBar({
  stops,
  activeStopId,
  onSelect,
  onMove,
  gradientCss,
}: {
  stops: GradientStop[];
  activeStopId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, pos: number) => void;
  gradientCss: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  function onKeyDown(e: React.KeyboardEvent) {
    if (!activeStopId) return;
    const stop = stops.find((s) => s.id === activeStopId);
    if (!stop) return;
    const step = e.shiftKey ? LARGE_STEP : STEP;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onMove(activeStopId, clamp(stop.position + step, 0, 100));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onMove(activeStopId, clamp(stop.position - step, 0, 100));
    }
  }
  return (
    <div
      ref={barRef}
      tabIndex={0}
      role="slider"
      aria-label="Gradient stops"
      aria-valuenow={stops.find((s) => s.id === activeStopId)?.position ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative h-6 rounded-md cursor-crosshair select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
      style={{ background: gradientCss }}
      onPointerMove={(e) => {
        if (!dragging.current || !barRef.current) return;
        const r = barRef.current.getBoundingClientRect();
        onMove(dragging.current, Math.round(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100)));
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onKeyDown={onKeyDown}
    >
      {stops.map((s) => (
        <div
          key={s.id}
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing w-3 h-8 rounded-sm border-2 shadow-md transition-shadow",
            activeStopId === s.id ? "border-primary ring-2 ring-primary/30 z-10" : "border-white",
          )}
          style={{ left: `${s.position}%`, background: s.color }}
          onPointerDown={(e) => {
            e.stopPropagation();
            dragging.current = s.id;
            onSelect(s.id);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
        />
      ))}
    </div>
  );
}

function AngleDial({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  function update(e: { clientX: number; clientY: number }) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let deg = Math.round(
      (Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) * 180) /
        Math.PI +
        90,
    );
    if (deg < 0) deg += 360;
    onChange(deg % 360);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange((angle + step) % 360);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange((angle - step + 360) % 360);
    }
  }
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label="Angle"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={angle}
      className="relative size-7 rounded-full border bg-muted/30 cursor-crosshair select-none shrink-0 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => dragging.current && update(e)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute top-1/2 left-1/2 w-2.5 h-0.5 bg-foreground rounded-full origin-left"
        style={{ transform: `rotate(${angle - 90}deg) translateY(-50%)` }}
      />
    </div>
  );
}

const INPUT_CLS =
  "min-w-10 flex-1 text-xs font-mono bg-transparent border rounded px-1.5 py-1 outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const MODES: { id: GradientType; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "linear", label: "Linear" },
  { id: "radial", label: "Radial" },
  { id: "angular", label: "Angular" },
];

function ModeTabs({
  active,
  onChange,
  enableGradient,
}: {
  active: GradientType;
  onChange: (t: GradientType) => void;
  enableGradient: boolean;
}) {
  const items = enableGradient ? MODES : MODES.slice(0, 1);
  if (items.length <= 1) return null;
  return (
    <div className="flex items-center rounded-md border text-xs">
      {items.map((t, i) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex-1 px-2 py-1 cursor-pointer transition-colors font-medium",
            i > 0 && "border-l",
            active === t.id ? "bg-accent" : "text-muted-foreground hover:bg-muted/50",
            i === 0 && "rounded-l-md",
            i === items.length - 1 && "rounded-r-md",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FloatingPopover({
  triggerEl,
  children,
  offset,
  className,
}: {
  triggerEl?: HTMLElement | null;
  children: React.ReactNode;
  offset?: { x: number; y: number };
  className?: string;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = triggerEl;
    const pop = popRef.current;
    if (!el || !pop) return;
    const rect = el.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const ox = offset?.x ?? 0;
    const oy = offset?.y ?? 0;
    const alignRight = rect.left > window.innerWidth / 2;
    const above = rect.top > window.innerHeight / 2;
    pop.style.left = `${(alignRight ? rect.right - popRect.width : rect.left) + ox}px`;
    pop.style.top = `${(above ? rect.top - popRect.height - 4 : rect.bottom + 4) + oy}px`;
    pop.style.visibility = "visible";
  });
  return createPortal(
    <div
      ref={popRef}
      data-color-picker-popover
      className={cn("fixed z-50 rounded-lg border bg-popover p-3 shadow-lg", className)}
      style={{ visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

interface SolidPickerProps {
  value: string;
  opacity?: number;
  format?: ColorFormat;
  onSave: (hex: string, opacity: number) => void;
  onCancel: () => void;
  onChange?: (hex: string, opacity: number) => void;
  hideActions?: boolean;
  cancelLabel?: string;
  saveLabel?: string;
}

function SolidPickerContent({
  value,
  opacity: initialOpacity = 100,
  format: initialFormat = "hex",
  onSave,
  onCancel,
  onChange,
  hideActions = false,
  cancelLabel = "Cancel",
  saveLabel = "Save",
}: SolidPickerProps) {
  const hsb = hexToHsb(value || "#000000");
  const [hue, setHue] = useState(hsb.h);
  const [sat, setSat] = useState(hsb.s);
  const [bright, setBright] = useState(hsb.b);
  const [opacity, setOpacity] = useState(initialOpacity);
  const [mode, setMode] = useState<ColorFormat>(initialFormat);
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const currentHex = hsbToHex(hue, sat, bright);
  const hexDisplayed = hexDraft ?? currentHex.toUpperCase();
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  function notify(hex: string, op: number) {
    onChangeRef.current?.(hex, op);
  }
  function setHueAndNotify(h: number) {
    setHue(h);
    notify(hsbToHex(h, sat, bright), opacity);
  }
  function setSatBrightAndNotify(s: number, b: number) {
    setSat(s);
    setBright(b);
    notify(hsbToHex(hue, s, b), opacity);
  }
  function setOpacityAndNotify(o: number) {
    setOpacity(o);
    notify(currentHex, o);
  }
  function setFromHex(hex: string) {
    if (!isValidHex(hex)) return;
    const h = hexToHsb(hex);
    setHue(h.h);
    setSat(h.s);
    setBright(h.b);
    notify(hex, opacity);
  }

  const { r, g, b: blue } = hexToRgb(currentHex);
  const { h: hslH, s: hslS, l: hslL } = hexToHsl(currentHex);
  const { c: cmykC, m: cmykM, y: cmykY, k: cmykK } = hexToCmyk(currentHex);
  const fmtModes: ColorFormat[] = ["hex", "rgb", "hsl", "cmyk"];

  function renderInputs() {
    switch (mode) {
      case "hex":
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">HEX</span>
            <input
              className={cn(
                INPUT_CLS,
                "flex-1 text-left",
                hexDraft !== null &&
                  !isValidHex(hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`) &&
                  "border-destructive text-destructive",
              )}
              value={hexDisplayed}
              onChange={(e) => {
                setHexDraft(e.target.value);
                const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                if (isValidHex(v)) setFromHex(v.toLowerCase());
              }}
              onFocus={() => setHexDraft(currentHex.toUpperCase())}
              onBlur={() => setHexDraft(null)}
            />
          </div>
        );
      case "rgb":
        return (
          <div className="flex gap-3">
            {[
              { l: "R", v: r, fn: (n: number) => rgbToHex(n, g, blue) },
              { l: "G", v: g, fn: (n: number) => rgbToHex(r, n, blue) },
              { l: "B", v: blue, fn: (n: number) => rgbToHex(r, g, n) },
            ].map(({ l, v, fn }) => (
              <div key={l} className="flex items-center gap-1.5 flex-1">
                <span className="text-xs text-muted-foreground">{l}</span>
                <DraftNumberInput
                  value={v}
                  max={255}
                  onChange={(n) => setFromHex(fn(n))}
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        );
      case "hsl":
        return (
          <div className="flex gap-3">
            {[
              { l: "H", v: hslH, max: 360, fn: (n: number) => hslToHex(n, hslS, hslL) },
              { l: "S", v: hslS, max: 100, fn: (n: number) => hslToHex(hslH, n, hslL) },
              { l: "L", v: hslL, max: 100, fn: (n: number) => hslToHex(hslH, hslS, n) },
            ].map(({ l, v, max, fn }) => (
              <div key={l} className="flex items-center gap-1.5 flex-1">
                <span className="text-xs text-muted-foreground">{l}</span>
                <DraftNumberInput
                  value={v}
                  max={max}
                  onChange={(n) => setFromHex(fn(n))}
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        );
      case "cmyk":
        return (
          <div className="flex gap-3">
            {[
              { l: "C", v: cmykC, fn: (n: number) => cmykToHex(n, cmykM, cmykY, cmykK) },
              { l: "M", v: cmykM, fn: (n: number) => cmykToHex(cmykC, n, cmykY, cmykK) },
              { l: "Y", v: cmykY, fn: (n: number) => cmykToHex(cmykC, cmykM, n, cmykK) },
              { l: "K", v: cmykK, fn: (n: number) => cmykToHex(cmykC, cmykM, cmykY, n) },
            ].map(({ l, v, fn }) => (
              <div key={l} className="flex items-center gap-1.5 flex-1">
                <span className="text-xs text-muted-foreground">{l}</span>
                <DraftNumberInput
                  value={v}
                  max={100}
                  onChange={(n) => setFromHex(fn(n))}
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        );
    }
  }

  return (
    <div className="space-y-3">
      <SatBrightCanvas
        hue={hue}
        saturation={sat}
        brightness={bright}
        onChange={setSatBrightAndNotify}
      />
      <HueSlider hue={hue} onChange={setHueAndNotify} />
      <OpacitySlider hex={currentHex} opacity={opacity} onChange={setOpacityAndNotify} />
      <div className="flex items-center gap-1.5">
        <ColorSwatch hex={currentHex} opacity={opacity} size="size-7" className="cursor-default" />
        <div className="flex items-center rounded-md border text-xs w-full">
          {fmtModes.map((m, i) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 px-1.5 py-1 cursor-pointer transition-colors uppercase font-medium",
                i > 0 && "border-l",
                mode === m ? "bg-accent" : "text-muted-foreground hover:bg-muted/50",
                i === 0 && "rounded-l-md",
                i === fmtModes.length - 1 && "rounded-r-md",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <DraftNumberInput
          value={opacity}
          max={100}
          onChange={setOpacityAndNotify}
          className={cn(INPUT_CLS, "w-12 shrink-0")}
        />
        <span className="text-xs text-muted-foreground shrink-0">%</span>
      </div>
      {renderInputs()}
      {!hideActions && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" onClick={() => onSave(currentHex, opacity)}>
            {saveLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

interface GradientPickerContentProps {
  gradient: GradientValue;
  onChange: (g: GradientValue) => void;
  onSave: (g: GradientValue) => void;
  onCancel: () => void;
  format?: ColorFormat;
  cancelLabel?: string;
  saveLabel?: string;
}

function GradientPickerContent({
  gradient,
  onChange,
  onSave,
  onCancel,
  format,
  cancelLabel = "Cancel",
  saveLabel = "Save",
}: GradientPickerContentProps) {
  const [activeStopId, setActiveStopId] = useState(gradient.stops[0]?.id ?? "");
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const originalStopRef = useRef<{ color: string; opacity: number } | null>(null);
  const swatchRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const editingStop = gradient.stops.find((s) => s.id === editingStopId);
  const editSwatchEl = editingStopId ? (swatchRefs.current.get(editingStopId) ?? null) : null;
  const [, forceUpdate] = useState(0);

  function openStopEditor(stopId: string) {
    const stop = gradient.stops.find((s) => s.id === stopId);
    if (stop) originalStopRef.current = { color: stop.color, opacity: stop.opacity };
    setActiveStopId(stopId);
    setEditingStopId(editingStopId === stopId ? null : stopId);
    forceUpdate((n) => n + 1);
  }

  function cancelStopEditor() {
    if (editingStopId && originalStopRef.current)
      updateStop(editingStopId, originalStopRef.current);
    originalStopRef.current = null;
    setEditingStopId(null);
  }

  function applyStopEditor() {
    originalStopRef.current = null;
    setEditingStopId(null);
  }

  function updateStop(id: string, patch: Partial<GradientStop>) {
    onChange({
      ...gradient,
      stops: gradient.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function addStop() {
    const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
    let bestGap = 0,
      bestPos = 50;
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i],
        next = sorted[i + 1];
      if (!cur || !next) continue;
      const gap = next.position - cur.position;
      if (gap > bestGap) {
        bestGap = gap;
        bestPos = Math.round(cur.position + gap / 2);
      }
    }
    const newStop: GradientStop = {
      id: makeId(),
      color: sorted[0]?.color ?? "#888888",
      position: bestPos,
      opacity: 100,
    };
    onChange({ ...gradient, stops: [...gradient.stops, newStop] });
    setActiveStopId(newStop.id);
  }

  function removeStop(id: string) {
    if (gradient.stops.length <= 2) return;
    const remaining = gradient.stops.filter((s) => s.id !== id);
    onChange({ ...gradient, stops: remaining });
    if (activeStopId === id && remaining[0]) setActiveStopId(remaining[0].id);
    if (editingStopId === id) setEditingStopId(null);
  }

  const previewCss = useMemo(() => {
    const stopsCss = [...gradient.stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => {
        const { r, g, b } = hexToRgb(s.color);
        return `rgba(${r}, ${g}, ${b}, ${s.opacity / 100}) ${s.position}%`;
      })
      .join(", ");
    return `linear-gradient(to right, ${stopsCss})`;
  }, [gradient.stops]);

  return (
    <div className="space-y-3">
      <div
        className="h-24 rounded-md overflow-hidden"
        style={{
          backgroundImage: checkerBg,
          backgroundSize: checkerSize,
          backgroundPosition: checkerPosition,
        }}
      >
        <div className="w-full h-full" style={{ background: gradientToCss(gradient) }} />
      </div>
      <GradientStopBar
        stops={gradient.stops}
        activeStopId={activeStopId}
        onSelect={setActiveStopId}
        onMove={(id, pos) => updateStop(id, { position: pos })}
        gradientCss={previewCss}
      />
      {(gradient.type === "linear" || gradient.type === "angular") && (
        <div className="flex items-center gap-1.5">
          <AngleDial angle={gradient.angle} onChange={(a) => onChange({ ...gradient, angle: a })} />
          <DraftNumberInput
            value={gradient.angle}
            max={360}
            onChange={(a) => onChange({ ...gradient, angle: a })}
            className={cn(INPUT_CLS, "w-10")}
          />
          <span className="text-[10px] text-muted-foreground">°</span>
        </div>
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Stops</span>
          <button
            onClick={addStop}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
        <div className="space-y-0.5">
          {[...gradient.stops]
            .sort((a, b) => a.position - b.position)
            .map((stop) => (
              <div
                key={stop.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
                  activeStopId === stop.id ? "bg-muted/50" : "hover:bg-muted/30",
                )}
              >
                <DraftNumberInput
                  value={stop.position}
                  max={100}
                  onChange={(p) => updateStop(stop.id, { position: p })}
                  className={cn(INPUT_CLS, "w-10 shrink-0")}
                />
                <span className="text-[10px] text-muted-foreground shrink-0">%</span>
                <button
                  ref={(el) => {
                    if (el) swatchRefs.current.set(stop.id, el);
                    else swatchRefs.current.delete(stop.id);
                  }}
                  onClick={() => openStopEditor(stop.id)}
                  className={cn(
                    "size-5 rounded shrink-0 cursor-pointer transition-shadow",
                    editingStopId === stop.id && "ring-2 ring-primary/40",
                  )}
                  style={{ background: stop.color }}
                />
                <input
                  value={stop.color.replace("#", "").toUpperCase()}
                  className={cn(INPUT_CLS, "w-16 text-left")}
                  onChange={(e) => {
                    const v = `#${e.target.value.replace("#", "")}`;
                    if (isValidHex(v)) updateStop(stop.id, { color: v.toLowerCase() });
                  }}
                />
                <DraftNumberInput
                  value={stop.opacity}
                  max={100}
                  onChange={(o) => updateStop(stop.id, { opacity: o })}
                  className={cn(INPUT_CLS, "w-10 shrink-0")}
                />
                <span className="text-[10px] text-muted-foreground shrink-0">%</span>
                {gradient.stops.length > 2 && (
                  <button
                    onClick={() => removeStop(stop.id)}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                  >
                    <MinusIcon className="size-3" />
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button size="sm" onClick={() => onSave(gradient)}>
          {saveLabel}
        </Button>
      </div>
      {editingStop && editSwatchEl && (
        <FloatingPopover triggerEl={editSwatchEl} offset={{ x: 0, y: 0 }} className="z-60">
          <div className="w-64 space-y-3">
            <SolidPickerContent
              value={editingStop.color}
              opacity={editingStop.opacity}
              format={format}
              cancelLabel="Cancel"
              saveLabel="Apply"
              onChange={(hex, opacity) => updateStop(editingStop.id, { color: hex, opacity })}
              onCancel={cancelStopEditor}
              onSave={applyStopEditor}
            />
          </div>
        </FloatingPopover>
      )}
    </div>
  );
}

// ── Main ColorPicker ────────────────────────────────────────────

export interface ColorPickerProps {
  value: string;
  opacity?: number;
  gradient?: GradientValue;
  onSave: (hex: string, opacity: number, gradient?: GradientValue) => void;
  onCancel: () => void;
  format?: ColorFormat;
  enableGradient?: boolean;
  cancelLabel?: string;
  saveLabel?: string;
}

export function ColorPicker({
  value,
  opacity: initialOpacity = 100,
  gradient: initialGradient,
  onSave,
  onCancel,
  format = "hex",
  enableGradient = false,
  cancelLabel = "Cancel",
  saveLabel = "Save",
}: ColorPickerProps) {
  const [gradType, setGradType] = useState<GradientType>(initialGradient?.type ?? "solid");
  const [gradient, setGradient] = useState<GradientValue>(
    initialGradient ?? defaultGradient(value),
  );

  function handleModeChange(type: GradientType) {
    if (type === "solid" && gradType !== "solid") {
      setGradType("solid");
    } else if (type !== "solid") {
      if (gradType === "solid") {
        setGradient({ ...defaultGradient(value), type });
      } else {
        setGradient({ ...gradient, type });
      }
      setGradType(type);
    }
  }

  const isGradient = gradType !== "solid";

  return (
    <div className="w-64 space-y-3">
      <ModeTabs active={gradType} onChange={handleModeChange} enableGradient={enableGradient} />
      {isGradient ? (
        <GradientPickerContent
          gradient={gradient}
          onChange={setGradient}
          onSave={(g) => onSave(g.stops[0]?.color ?? value, 100, g)}
          onCancel={onCancel}
          format={format}
          cancelLabel={cancelLabel}
          saveLabel={saveLabel}
        />
      ) : (
        <SolidPickerContent
          value={value}
          opacity={initialOpacity}
          format={format}
          onSave={(hex, opacity) => onSave(hex, opacity)}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          saveLabel={saveLabel}
        />
      )}
    </div>
  );
}
