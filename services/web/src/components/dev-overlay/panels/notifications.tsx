"use client"

import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format-time"
import { trpc } from "@/lib/trpc"
import { CollapsibleSection } from "../collapsible-section"

/**
 * Dev-only notifications panel. Three things:
 *   - Live unread + total counts so you can sanity-check inbox state.
 *   - "Send test" buttons per registered kind (fires `notifications.dev.testSend`,
 *     which calls `notify()` server-side with synthetic data).
 *   - Reset prefs (clears every NotificationPreference row for the user).
 *
 * The dev `testSend` mutation 404s in production, so the panel is only
 * useful in dev anyway. The whole DevOverlay is also production-stripped
 * by the parent component.
 */
export function NotificationsPanel() {
  const t = useTranslations("devOverlay")
  const tKinds = useTranslations("account.notifications.kinds")
  const locale = useLocale()
  const utils = trpc.useUtils()

  const session = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false })
  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
    enabled: Boolean(session.data),
  })
  const list = trpc.notifications.list.useQuery(
    { limit: 5 },
    { refetchOnWindowFocus: false, enabled: Boolean(session.data) },
  )
  const kinds = trpc.notifications.dev.listKinds.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const testSend = trpc.notifications.dev.testSend.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate()
      void utils.notifications.list.invalidate()
    },
  })
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate()
      void utils.notifications.list.invalidate()
    },
  })
  const resetPrefs = trpc.notifications.preferences.reset.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.get.invalidate()
    },
  })

  const signedIn = Boolean(session.data)
  const count = unread.data?.count ?? 0
  const items = list.data?.items ?? []

  const badge = (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
        count > 0
          ? "bg-[color-mix(in_oklab,var(--brand-accent)_20%,transparent)] text-[var(--brand-accent)]"
          : "bg-border text-muted-foreground"
      }`}
    >
      {count > 0 ? `${count} ${t("notifications.unreadShort")}` : t("notifications.zero")}
    </span>
  )

  return (
    <CollapsibleSection title={t("sections.notifications")} badge={badge}>
      {!signedIn ? (
        <p className="text-xs text-muted-foreground">
          {t("notifications.signInPrompt")}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || count === 0}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("notifications.markAllRead")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetPrefs.mutate()}
              disabled={resetPrefs.isPending}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("notifications.resetPrefs")}
            </Button>
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("notifications.sendTest")}
            </p>
            {kinds.data && kinds.data.kinds.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {kinds.data.kinds.map((entry) => (
                  <Button
                    key={entry.kind}
                    variant="outline"
                    size="sm"
                    onClick={() => testSend.mutate({ kind: entry.kind })}
                    disabled={testSend.isPending}
                    title={`${entry.kind} · ${entry.category} · ${entry.channels.join(" + ")}`}
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {tKinds(entry.kind)}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs opacity-60">{t("notifications.noKinds")}</p>
            )}
            {testSend.data && (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {t("notifications.lastResult", {
                  delivered: testSend.data.deliveryIds.length,
                  skipped: testSend.data.skipped.length,
                })}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("notifications.recent")}
            </p>
            {list.isLoading ? (
              <p className="text-xs opacity-60">…</p>
            ) : items.length === 0 ? (
              <p className="text-xs opacity-60">{t("notifications.recentEmpty")}</p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline gap-2 text-[11px]"
                  >
                    <span
                      aria-hidden
                      className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        item.readAt ? "bg-transparent" : "bg-[var(--brand-accent)]"
                      }`}
                    />
                    <span className="truncate font-medium">{item.subject}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(item.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}
