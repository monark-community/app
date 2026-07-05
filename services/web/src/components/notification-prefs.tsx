"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupedMultiSelect, type GroupedMultiSelectGroup } from "@/components/patterns";

export type NotificationPrefChannel = "IN_APP" | "EMAIL";

export type NotificationPrefCell = {
  channel: NotificationPrefChannel;
  enabled: boolean;
  /** requiredEmail EMAIL — locked on, checkbox disabled. */
  forced: boolean;
  /** Whether the kind supports this channel at all. */
  available: boolean;
};

export type NotificationPrefKind = {
  kind: string;
  category: string;
  cells: NotificationPrefCell[];
};

// Stable category order for the grouped display ; categories with no
// email-capable kinds are dropped, so this can safely list every enum value.
const CATEGORY_ORDER = ["SECURITY", "ACCOUNT", "ACTIVITY", "DIGEST"] as const;

/** Kind ids contain dots ; i18n keys can't, so `auth.new-device` → `auth_new-device`. */
function kindKey(kind: string): string {
  return kind.replaceAll(".", "_");
}

/**
 * Per-event notification preferences. One checkbox per event, left of its
 * description — the same shell (search + collapsible category groups +
 * tri-state select-all) the RBAC role editor and webhook subscription
 * picker use, via the shared `GroupedMultiSelect` in checkbox mode.
 *
 * Only the EMAIL channel is user-configurable : in-app delivery is
 * controlled by the platform, so kinds that can't email are hidden here.
 * `requiredEmail` kinds (account-safety security alerts) render checked +
 * disabled with a "required" hint — the user is shown they always get
 * them, but can't turn them off. Presentational — the caller (self-service
 * or admin) wires the tRPC get/set/reset.
 */
export function NotificationPrefs({
  data,
  isLoading,
  onToggle,
  onReset,
  isResetting,
  disabled,
}: {
  data: NotificationPrefKind[] | undefined;
  isLoading: boolean;
  onToggle: (kind: string, enabled: boolean) => void;
  onReset: () => void;
  isResetting: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("account.notifications.prefs");
  const tCat = useTranslations("account.notifications.prefs.categories");
  const tKind = useTranslations("account.notifications.prefs.kinds");
  const tDesc = useTranslations("account.notifications.prefs.kindDescriptions");

  const kinds = data ?? [];

  // Email is the only user-configurable channel ; keep the EMAIL cell for
  // every kind that supports it (forced state included) and drop the rest.
  const emailByKind = useMemo(() => {
    const map = new Map<string, { enabled: boolean; forced: boolean }>();
    for (const k of kinds) {
      const cell = k.cells.find((c) => c.channel === "EMAIL" && c.available);
      if (cell) map.set(k.kind, { enabled: cell.enabled, forced: cell.forced });
    }
    return map;
  }, [kinds]);

  const groups = useMemo<GroupedMultiSelectGroup[]>(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        key: cat,
        label: tCat(cat),
        monoItems: false,
        items: kinds
          .filter((k) => k.category === cat && emailByKind.has(k.kind))
          .map((k) => {
            const key = kindKey(k.kind);
            const forced = emailByKind.get(k.kind)?.forced ?? false;
            return {
              value: k.kind,
              primary: tKind(key),
              secondary: tDesc(key),
              // Lead the description with a "Required" badge on locked rows
              // so the reason the checkbox is disabled sits right next to it.
              secondaryPrefix: forced ? (
                <Badge variant="secondary" size="sm" className="shrink-0">
                  {t("forcedBadge")}
                </Badge>
              ) : undefined,
            };
          }),
      })).filter((g) => g.items.length > 0),
    [kinds, emailByKind, tCat, tKind, tDesc, t],
  );

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-md" />;
  }

  function toggleGroup(group: GroupedMultiSelectGroup, selectAll: boolean) {
    if (disabled) return;
    for (const item of group.items) {
      const entry = emailByKind.get(item.value);
      // Never flip a forced (locked-on) row ; only write when the value
      // actually changes to keep the mutation count minimal.
      if (!entry || entry.forced) continue;
      if (entry.enabled !== selectAll) onToggle(item.value, selectAll);
    }
  }

  return (
    <div className="space-y-3">
      <GroupedMultiSelect
        groups={groups}
        isChecked={(value) => emailByKind.get(value)?.enabled ?? false}
        isItemDisabled={(value) => Boolean(disabled) || (emailByKind.get(value)?.forced ?? false)}
        onToggleItem={(_group, value, next) => {
          if (disabled) return;
          onToggle(value, next);
        }}
        onToggleGroup={toggleGroup}
        labels={{
          searchPlaceholder: t("searchPlaceholder"),
          searchAria: t("searchAria"),
          toggleAllAria: (category) => t("toggleAllAria", { category }),
        }}
        renderEmpty={(q) => (q !== "" ? t("searchEmpty") : t("empty"))}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={Boolean(disabled) || isResetting}
        >
          {t("resetButton")}
        </Button>
      </div>
    </div>
  );
}
