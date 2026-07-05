"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGlobalSearch } from "./global-search-provider";
import { useIsApplePlatform } from "./use-is-apple-platform";

/**
 * Compact search trigger for the AppBar : a ghost magnifier icon button
 * that opens the command palette, with a hover tooltip advertising the
 * ⌘K / Ctrl+K shortcut.
 */
export function GlobalSearchIconButton() {
  const t = useTranslations("globalSearch");
  const { open } = useGlobalSearch();
  const isMac = useIsApplePlatform();

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("trigger")}
            onClick={open}
            className="text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("trigger")}{" "}
          <KbdGroup>
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
