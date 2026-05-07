"use client"

import Link from "next/link"
import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  AtSign,
  Bell,
  Check,
  CheckCircle2,
  KeyRound,
  Laptop,
  Mail,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { formatRelativeTime } from "@/lib/format-time"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

const POLL_INTERVAL_MS = 60_000
const PAGE_SIZE = 20

type Filter = "unread" | "all"

// Per-kind icon registry. Each notification carries its `kind` string
// (`auth.password-changed`, `account.deletion-scheduled`, …) ; the
// drawer paints a small glyph per row so the user can scan the inbox
// at a glance instead of reading every subject. Falls back to the
// neutral bell when an unknown kind comes through (e.g. an in-flight
// new kind not yet in the map).
const KIND_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  "auth.password-changed": { icon: KeyRound, tone: "text-amber-500" },
  "auth.new-device": { icon: Laptop, tone: "text-blue-400" },
  "auth.totp-enabled": { icon: ShieldCheck, tone: "text-emerald-500" },
  "auth.totp-disabled": { icon: ShieldOff, tone: "text-amber-500" },
  "auth.all-devices-revoked": { icon: ShieldAlert, tone: "text-amber-500" },
  "account.email-changed": { icon: AtSign, tone: "text-blue-400" },
  "account.deletion-scheduled": {
    icon: TriangleAlert,
    tone: "text-destructive",
  },
  "account.deletion-canceled": { icon: CheckCircle2, tone: "text-emerald-500" },
}

function iconForKind(kind: string): { Icon: LucideIcon; tone: string } {
  const entry = KIND_ICONS[kind] ?? { icon: Mail, tone: "text-muted-foreground" }
  return { Icon: entry.icon, tone: entry.tone }
}

/**
 * Header bell + side-drawer for in-app notifications. The badge drives
 * off `unreadCount` (cheap indexed COUNT, polled every 60s + on focus).
 * Clicking the bell opens a right-side `<Sheet>` matching the user-menu
 * pattern ; the drawer hosts the entire inbox surface :
 *
 *   - Unread / All tabs, persisted client-side, drive the `filter`
 *     param of the paginated `notifications.list` query.
 *   - Mark all as read button, surfaced when the user has unread.
 *   - Per-row dropdown : mark read / mark unread / dismiss.
 *   - Per-kind icon (key, laptop, shield-check, …) so rows scan
 *     without the user having to read every subject.
 *   - "Load more" button at the bottom for pagination.
 *
 * Replaces the lightweight popover + standalone `/inbox` page ; the
 * drawer covers both surfaces in one place. The page's
 * `notifications-bell.tsx` previous incarnation was a click-outside
 * popover ; we now lean on the Sheet primitive's overlay + Esc handling
 * so we don't carry our own.
 */
export function NotificationsBell() {
  const t = useTranslations("account.notifications")
  const locale = useLocale()
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>("unread")

  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const list = trpc.notifications.list.useInfiniteQuery(
    { limit: PAGE_SIZE, filter },
    {
      enabled: open,
      refetchOnWindowFocus: open,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    },
  )

  function invalidateAll() {
    void utils.notifications.unreadCount.invalidate()
    void utils.notifications.list.invalidate()
  }

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: invalidateAll,
  })
  const markUnread = trpc.notifications.markUnread.useMutation({
    onSuccess: invalidateAll,
  })
  const dismiss = trpc.notifications.dismiss.useMutation({
    onSuccess: invalidateAll,
  })
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: invalidateAll,
  })

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const count = unread.data?.count ?? 0
  const badgeLabel = count > 9 ? "9+" : String(count)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("bellAriaLabel", { count })}
          aria-expanded={open}
          className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-(--brand-accent) px-1 text-[10px] font-semibold leading-none text-white"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        // Lift the SheetContent built-in close X above the in-content
        // scroll region so it stays clickable. Same trick as the
        // user-menu drawer.
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md [&>button]:z-50"
        aria-label={t("popoverAriaLabel")}
      >
        <SheetTitle className="sr-only">{t("title")}</SheetTitle>

        <div className="border-b border-border p-4 pr-12">
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          {/* Filter tabs : Unread first since that's the actionable
              subset. Active style is a subtle filled pill ; inactive
              is muted text. */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label={t("filterTabsAria")}
              className="flex gap-1 rounded-md border border-border p-1"
            >
              {(["unread", "all"] as const).map((value) => {
                const active = filter === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(value)}
                    className={cn(
                      "cursor-pointer rounded px-3 py-1 text-xs transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {value === "unread"
                      ? t("filterUnread")
                      : t("filterAll")}
                  </button>
                )
              })}
            </div>
            {count > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="h-7 px-2 text-xs"
              >
                <Check className="h-3 w-3" aria-hidden />
                {t("markAllRead")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {list.isLoading ? (
            <p className="px-4 py-12 text-center text-xs text-muted-foreground">
              {t("loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const { Icon, tone } = iconForKind(item.kind)
                const isUnread = !item.readAt
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors",
                      isUnread && "bg-muted/30",
                    )}
                  >
                    {/* Icon stack : the kind glyph in a coloured
                        circle, matching the email category tone. */}
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
                    >
                      <Icon className={cn("h-4 w-4", tone)} aria-hidden />
                    </span>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      {/* Subject + dot. Subject is bold for unread,
                          neutral for read ; the unread dot reinforces
                          the bold-vs-light distinction. */}
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm",
                            isUnread
                              ? "font-semibold"
                              : "font-normal text-muted-foreground",
                          )}
                        >
                          {item.subject}
                        </span>
                        {isUnread && (
                          <span
                            aria-hidden
                            className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--brand-accent)"
                          />
                        )}
                      </div>
                      {item.body && (
                        <p className="text-xs text-muted-foreground">
                          {item.body}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(item.createdAt, locale)}
                      </p>
                      {item.link && (
                        <Link
                          href={item.link}
                          onClick={() => {
                            if (isUnread) markRead.mutate({ id: item.id })
                            setOpen(false)
                          }}
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          {t("open")}
                        </Link>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("rowActionsAria")}
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4}>
                        {isUnread ? (
                          <DropdownMenuItem
                            onSelect={() => markRead.mutate({ id: item.id })}
                          >
                            <Check className="h-4 w-4" aria-hidden />
                            {t("markRead")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => markUnread.mutate({ id: item.id })}
                          >
                            <Check className="h-4 w-4" aria-hidden />
                            {t("markUnread")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() => dismiss.mutate({ id: item.id })}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          {t("dismiss")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}

          {list.hasNextPage && (
            <div className="flex justify-center p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage ? t("loading") : t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
