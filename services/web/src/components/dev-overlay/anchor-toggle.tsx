"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Which viewport corner the dev overlay (toggle button + panel) pins to. */
export type OverlayAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const OVERLAY_ANCHORS: OverlayAnchor[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export function isOverlayAnchor(value: unknown): value is OverlayAnchor {
  return typeof value === "string" && (OVERLAY_ANCHORS as string[]).includes(value);
}

/** Fixed-position classes for the toggle button, per corner. Full literal
 *  strings so Tailwind's scanner keeps them. */
export const ANCHOR_BUTTON_CLASS: Record<OverlayAnchor, string> = {
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-right": "bottom-4 right-4",
};

/** Panel classes per corner : offset past the 40px button on the anchored edge
 *  so the two never overlap, sharing the same horizontal side. */
export const ANCHOR_PANEL_CLASS: Record<OverlayAnchor, string> = {
  "top-left": "top-16 left-4",
  "top-right": "top-16 right-4",
  "bottom-left": "bottom-16 left-4",
  "bottom-right": "bottom-16 right-4",
};

const ANCHOR_ICON: Record<OverlayAnchor, ComponentType<{ className?: string }>> = {
  "top-left": ArrowUpLeft,
  "top-right": ArrowUpRight,
  "bottom-left": ArrowDownLeft,
  "bottom-right": ArrowDownRight,
};

const ANCHOR_KEY: Record<OverlayAnchor, string> = {
  "top-left": "topLeft",
  "top-right": "topRight",
  "bottom-left": "bottomLeft",
  "bottom-right": "bottomRight",
};

/** Header control that repositions the overlay to any viewport corner. */
export function AnchorToggle({
  anchor,
  onChange,
}: {
  anchor: OverlayAnchor;
  onChange: (anchor: OverlayAnchor) => void;
}) {
  const t = useTranslations("devOverlay");
  const CurrentIcon = ANCHOR_ICON[anchor];

  return (
    // modal={false} : keep it a non-modal menu so it never leaves a stuck
    // body pointer-events lock behind the overlay (see radix-pointer-events).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          title={t("anchor.label")}
          aria-label={t("anchor.label")}
        >
          <CurrentIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {OVERLAY_ANCHORS.map((value) => {
          const Icon = ANCHOR_ICON[value];
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onChange(value)}
              className="gap-2 text-xs"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="flex-1">{t(`anchor.${ANCHOR_KEY[value]}`)}</span>
              {anchor === value && <Check className="h-3.5 w-3.5" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
