"use client"

import { useLocale } from "next-intl"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { LOCALES, type Locale } from "@/i18n/config"
import { setLocaleAction } from "@/i18n/set-locale-action"

export function LocaleToggle() {
  const current = useLocale() as Locale
  const [isPending, startTransition] = useTransition()

  const next: Locale =
    LOCALES[(LOCALES.indexOf(current) + 1) % LOCALES.length] ?? LOCALES[0]

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => startTransition(() => setLocaleAction(next))}
      disabled={isPending}
      className="h-6 px-2 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
      title={`Switch to ${next}`}
      aria-label={`Switch to ${next}`}
    >
      {current}
    </Button>
  )
}
