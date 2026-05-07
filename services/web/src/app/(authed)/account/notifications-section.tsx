"use client"

import { useTranslations } from "next-intl"
import { HelpCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

// Phase-1 ships only SECURITY + ACCOUNT category notifications. The
// ACTIVITY + DIGEST categories are reserved in the Prisma enum +
// notification kind registry but no kinds use them yet ; surfacing
// empty toggle rows would just confuse the user. They'll be re-added
// here when phase-2 introduces kinds that route through them.
const CATEGORIES = ["SECURITY", "ACCOUNT"] as const
const CHANNELS = ["IN_APP", "EMAIL"] as const

type Category = (typeof CATEGORIES)[number]
type Channel = (typeof CHANNELS)[number]

export function NotificationsSection() {
  const t = useTranslations("account.notifications.prefs")
  const tCat = useTranslations("account.notifications.prefs.categories")
  const tCatDesc = useTranslations("account.notifications.prefs.categoryDescriptions")
  const tChan = useTranslations("account.notifications.prefs.channels")
  const utils = trpc.useUtils()

  const prefs = trpc.notifications.preferences.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const set = trpc.notifications.preferences.set.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.get.invalidate()
    },
  })
  const reset = trpc.notifications.preferences.reset.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.get.invalidate()
      toast.success(t("resetSuccess"))
    },
  })

  function toggle(category: Category, channel: Channel, current: boolean) {
    set.mutate({ category, channel, enabled: !current })
  }

  const cells = prefs.data?.cells ?? []
  const cellAt = (category: Category, channel: Channel) =>
    cells.find((c) => c.category === category && c.channel === channel)

  return (
    <Card className="bg-transparent shadow-none">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("categoryLabel")}</th>
                {CHANNELS.map((channel) => (
                  <th key={channel} className="px-4 py-2 font-medium">
                    {tChan(channel)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CATEGORIES.map((category) => (
                <tr key={category}>
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {tCat(category)}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("categoryHelpAria", { category: tCat(category) })}
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          sideOffset={4}
                          className="w-80 text-sm leading-relaxed"
                        >
                          {tCatDesc(category)}
                        </PopoverContent>
                      </Popover>
                    </span>
                  </td>
                  {CHANNELS.map((channel) => {
                    const cell = cellAt(category, channel)
                    if (!cell) {
                      return (
                        <td key={channel} className="px-4 py-3 text-muted-foreground">
                          —
                        </td>
                      )
                    }
                    return (
                      <td key={channel} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(category, channel, cell.enabled)}
                          disabled={cell.forced || set.isPending}
                          aria-pressed={cell.enabled}
                          aria-label={t(cell.enabled ? "disableAria" : "enableAria", {
                            category: tCat(category),
                            channel: tChan(channel),
                          })}
                          title={cell.forced ? t("forcedTooltip") : undefined}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                            cell.enabled ? "bg-primary" : "bg-muted",
                            // Hover variant only when the toggle is interactive ;
                            // when disabled (forced or in-flight) we want zero
                            // hover delta so the user sees that nothing will happen.
                            !(cell.forced || set.isPending) &&
                              (cell.enabled ? "hover:bg-primary/85" : "hover:bg-muted/70"),
                            (cell.forced || set.isPending) && "cursor-not-allowed opacity-70",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "inline-block h-4 w-4 translate-y-0.5 rounded-full bg-background shadow transition-transform",
                              cell.enabled ? "translate-x-4" : "translate-x-0.5",
                            )}
                          />
                        </button>
                        {cell.forced && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("forcedBadge")}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
          >
            {t("resetButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
