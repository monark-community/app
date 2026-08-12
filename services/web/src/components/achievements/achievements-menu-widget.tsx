"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Award, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShellWidgetProps } from "@/config/shell-widgets";

/**
 * Account-menu shell widget for `@monark/achievements` : the user's earned-badge
 * count + a stack of the most-recent badges, linking to the achievements gallery.
 * Registered in `config/shell-widgets.tsx` under the `account-menu` slot and
 * flag-gated by `achievements.enabled`, so it only mounts (and only queries)
 * where the module is turned on.
 */
export function AchievementsMenuWidget({ onNavigate }: ShellWidgetProps) {
  const t = useTranslations("achievements.menuWidget");
  const summary = trpc.achievements.summary.useQuery(
    { latest: 3 },
    { refetchOnWindowFocus: false },
  );
  const count = summary.data?.count ?? 0;
  const latest = summary.data?.latest ?? [];

  return (
    <Link
      href="/achievements"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--brand-accent)/15 text-(--brand-accent)"
        aria-hidden
      >
        <Award className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("title")}</p>
        {summary.isLoading ? (
          <Skeleton className="mt-1 h-3.5 w-24" />
        ) : (
          <p className="text-xs text-muted-foreground">{t("count", { count })}</p>
        )}
      </div>
      {summary.isLoading ? (
        <div className="flex -space-x-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-7 w-7 rounded-full border-2 border-background" />
          ))}
        </div>
      ) : (
        latest.length > 0 && (
          <div className="flex -space-x-2" aria-hidden>
            {latest.map((a) =>
              a.iconUrl ? (
                <img
                  key={a.id}
                  src={a.iconUrl}
                  alt=""
                  className="h-7 w-7 rounded-full border-2 border-background object-cover"
                />
              ) : (
                <span
                  key={a.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground"
                >
                  <Award className="h-3.5 w-3.5" />
                </span>
              ),
            )}
          </div>
        )
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
