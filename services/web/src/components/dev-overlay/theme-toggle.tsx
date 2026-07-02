"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("devOverlay");

  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme === "system" ? resolvedTheme : theme) : "dark";
  const next = current === "dark" ? "light" : "dark";
  const Icon = current === "dark" ? Moon : Sun;
  const label = t("themeSwitchTo", { theme: t(`theme.${next}`) });

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      className="h-6 w-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      title={label}
      aria-label={label}
    >
      <Icon />
    </Button>
  );
}
