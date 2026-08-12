"use client";

import { useMemo } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Award } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The user's achievements gallery : earned badges (unlocked), plus the rest of
 * the org catalog shown locked — with a progress bar when the user has started
 * making progress toward one.
 */
export function AchievementsGallery() {
  const t = useTranslations("achievements");
  const format = useFormatter();
  const catalog = trpc.achievements.catalog.useQuery();
  const awards = trpc.achievements.myAwards.useQuery();
  const progress = trpc.achievements.myProgress.useQuery();

  const earnedById = useMemo(
    () => new Map((awards.data ?? []).map((a) => [a.achievementId, a])),
    [awards.data],
  );
  const progressById = useMemo(
    () => new Map((progress.data ?? []).map((p) => [p.achievementId, p])),
    [progress.data],
  );

  if (catalog.isLoading || awards.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const items = catalog.data ?? [];
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  const earnedCount = items.filter((a) => earnedById.has(a.id)).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("summary", { earned: earnedCount, total: items.length })}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((a) => {
          const earned = earnedById.get(a.id);
          const prog = progressById.get(a.id);
          return (
            <li
              key={a.id}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-4 text-center",
                earned ? "bg-card" : "bg-muted/30",
              )}
            >
              {a.iconUrl ? (
                <img
                  src={a.iconUrl}
                  alt=""
                  className={cn(
                    "h-12 w-12 rounded object-cover",
                    !earned && "opacity-40 grayscale",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground",
                    !earned && "opacity-40 grayscale",
                  )}
                  aria-hidden
                >
                  <Award className="h-6 w-6" />
                </span>
              )}
              <span className={cn("mt-1 text-sm font-medium", !earned && "text-muted-foreground")}>
                {a.name}
              </span>
              {a.description && (
                <span className="line-clamp-2 text-xs text-muted-foreground">{a.description}</span>
              )}
              <Badge variant={earned ? "secondary" : "outline"} className="mt-1">
                {t("points", { points: a.points })}
              </Badge>
              {earned ? (
                <span className="text-[11px] text-muted-foreground">
                  {t("earnedOn", {
                    date: format.dateTime(new Date(earned.awardedAt), { dateStyle: "medium" }),
                  })}
                </span>
              ) : prog ? (
                <div className="mt-1 w-full">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round((prog.count / prog.threshold) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {prog.count} / {prog.threshold}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground">{t("locked")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
