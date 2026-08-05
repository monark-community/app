"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 20;

type Filter = "unread" | "all";

// Per-kind icon registry (see the old NotificationsBell for the rationale):
// paint a small glyph per row so the inbox scans without reading every subject.
const KIND_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  "auth.password-changed": { icon: KeyRound, tone: "text-amber-500" },
  "auth.new-device": { icon: Laptop, tone: "text-blue-400" },
  "auth.totp-enabled": { icon: ShieldCheck, tone: "text-emerald-500" },
  "auth.totp-disabled": { icon: ShieldOff, tone: "text-amber-500" },
  "auth.all-devices-revoked": { icon: ShieldAlert, tone: "text-amber-500" },
  "account.email-changed": { icon: AtSign, tone: "text-blue-400" },
  "account.deletion-scheduled": { icon: TriangleAlert, tone: "text-destructive" },
  "account.deletion-canceled": { icon: CheckCircle2, tone: "text-emerald-500" },
};

function iconForKind(kind: string): { Icon: LucideIcon; tone: string } {
  const entry = KIND_ICONS[kind] ?? { icon: Mail, tone: "text-muted-foreground" };
  return { Icon: entry.icon, tone: entry.tone };
}

/**
 * The in-app inbox surface, extracted from the (removed) header bell so it can
 * live inside the user-menu's "Notifications" tab. Self-contained: owns the
 * Unread/All filter, the paginated list, per-row + mark-all-read mutations. Pass
 * `onNavigate` so following a notification link closes the containing panel.
 * The unread COUNT (for the avatar badge) is a separate cheap query — see
 * `useUnreadNotificationCount`.
 */
export function NotificationsList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("account.notifications");
  const locale = useLocale();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Filter>("unread");

  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const list = trpc.notifications.list.useInfiniteQuery(
    { limit: PAGE_SIZE, filter },
    {
      refetchOnWindowFocus: true,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    },
  );

  function invalidateAll() {
    void utils.notifications.unreadCount.invalidate();
    void utils.notifications.list.invalidate();
  }

  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: invalidateAll });
  const markUnread = trpc.notifications.markUnread.useMutation({ onSuccess: invalidateAll });
  const dismiss = trpc.notifications.dismiss.useMutation({ onSuccess: invalidateAll });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: invalidateAll });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const count = unread.data?.count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Controls: Unread/All filter (Unread first — the actionable subset) +
          mark-all-read when there's anything unread. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div
          role="tablist"
          aria-label={t("filterTabsAria")}
          className="flex gap-1 rounded-md border border-border p-1"
        >
          {(["unread", "all"] as const).map((value) => {
            const active = filter === value;
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
                {value === "unread" ? t("filterUnread") : t("filterAll")}
              </button>
            );
          })}
        </div>
        {count > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <Check className="h-4 w-4" aria-hidden />
            {t("markAllRead")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {list.isLoading ? (
          <p className="px-4 py-12 text-center text-xs text-muted-foreground">{t("loading")}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <Bell className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const { Icon, tone } = iconForKind(item.kind);
              const isUnread = !item.readAt;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors",
                    isUnread && "bg-muted/30",
                  )}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
                  >
                    <Icon className={cn("h-4 w-4", tone)} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          isUnread ? "font-semibold" : "font-normal text-muted-foreground",
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
                    {item.body && <p className="text-xs text-muted-foreground">{item.body}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(item.createdAt, locale)}
                    </p>
                    {item.link && (
                      <Link
                        href={item.link}
                        onClick={() => {
                          if (isUnread) markRead.mutate({ id: item.id });
                          onNavigate?.();
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
                        <DropdownMenuItem onSelect={() => markRead.mutate({ id: item.id })}>
                          <Check className="h-4 w-4" aria-hidden />
                          {t("markRead")}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => markUnread.mutate({ id: item.id })}>
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
              );
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
    </div>
  );
}

/** Cheap unread count for the avatar badge (indexed COUNT, polled + on focus). */
export function useUnreadNotificationCount(): number {
  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  return unread.data?.count ?? 0;
}
