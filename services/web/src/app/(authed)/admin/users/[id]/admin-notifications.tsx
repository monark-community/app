"use client"

import { useTranslations } from "next-intl"
import { HelpCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PageSection } from "@/components/page-section"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

// Phase-1 ships only SECURITY + ACCOUNT category notifications. Same
// rationale as the self-service `<NotificationsSection>` ; matches
// the server-side `categorySchema` so an admin can't write a row the
// self-service UI couldn't reach.
const CATEGORIES = ["SECURITY", "ACCOUNT"] as const
const CHANNELS = ["IN_APP", "EMAIL"] as const

type Category = (typeof CATEGORIES)[number]
type Channel = (typeof CHANNELS)[number]

/**
 * Admin variant of `NotificationsSection`. Same UX shape (category ×
 * channel toggle matrix, popover help, reset-to-defaults) but every
 * read/write routes through the admin-gated tRPC procedures so the
 * server enforces rbac. Reuses the self-service i18n keys for the
 * matrix labels + cell copy ; admin-specific copy lives under
 * `admin.users.notifications.*` (title / subtitle).
 */
export function AdminNotifications({
  userId,
  disabled,
}: {
  userId: string
  disabled?: boolean
}) {
  const t = useTranslations("admin.users.notifications")
  const tShared = useTranslations("account.notifications.prefs")
  const tCat = useTranslations("account.notifications.prefs.categories")
  const tCatDesc = useTranslations("account.notifications.prefs.categoryDescriptions")
  const tChan = useTranslations("account.notifications.prefs.channels")
  const utils = trpc.useUtils()

  const prefs = trpc.notifications.preferences.adminGet.useQuery(
    { userId },
    { refetchOnWindowFocus: false },
  )
  const set = trpc.notifications.preferences.adminSet.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.adminGet.invalidate({ userId })
    },
  })
  const reset = trpc.notifications.preferences.adminReset.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.adminGet.invalidate({ userId })
      toast.success(t("resetSuccess"))
    },
  })

  function toggle(category: Category, channel: Channel, current: boolean) {
    if (disabled) return
    set.mutate({ userId, category, channel, enabled: !current })
  }

  const cells = prefs.data?.cells ?? []
  const cellAt = (category: Category, channel: Channel) =>
    cells.find((c) => c.category === category && c.channel === channel)

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">
                  {tShared("categoryLabel")}
                </th>
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
                            aria-label={tShared("categoryHelpAria", {
                              category: tCat(category),
                            })}
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
                    const interactive = !(cell.forced || set.isPending || disabled)
                    return (
                      <td key={channel} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(category, channel, cell.enabled)}
                          disabled={!interactive}
                          aria-pressed={cell.enabled}
                          aria-label={tShared(
                            cell.enabled ? "disableAria" : "enableAria",
                            {
                              category: tCat(category),
                              channel: tChan(channel),
                            },
                          )}
                          title={cell.forced ? tShared("forcedTooltip") : undefined}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                            cell.enabled ? "bg-primary" : "bg-muted",
                            interactive &&
                              (cell.enabled
                                ? "hover:bg-primary/85"
                                : "hover:bg-muted/70"),
                            !interactive && "cursor-not-allowed opacity-70",
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
                            {tShared("forcedBadge")}
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
            onClick={() => reset.mutate({ userId })}
            disabled={reset.isPending || disabled}
          >
          {tShared("resetButton")}
        </Button>
      </div>
    </PageSection>
  )
}
