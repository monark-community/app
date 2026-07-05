"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageSection } from "@/components/page-section";
import { NotificationPrefs } from "@/components/notification-prefs";
import { trpc } from "@/lib/trpc";

/**
 * Admin variant of `NotificationsSection`. Same per-event UX, but every
 * read/write routes through the admin-gated tRPC procedures so the server
 * enforces rbac. Reuses the shared `NotificationPrefs` component + its
 * i18n ; admin-specific title / subtitle live under
 * `admin.users.notifications.*`.
 */
export function AdminNotifications({ userId, disabled }: { userId: string; disabled?: boolean }) {
  const t = useTranslations("admin.users.notifications");
  const tShared = useTranslations("account.notifications.prefs");
  const utils = trpc.useUtils();

  const prefs = trpc.notifications.preferences.adminGet.useQuery(
    { userId },
    { refetchOnWindowFocus: false },
  );
  const set = trpc.notifications.preferences.adminSet.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.adminGet.invalidate({ userId });
    },
  });
  const reset = trpc.notifications.preferences.adminReset.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.adminGet.invalidate({ userId });
      toast.success(tShared("resetSuccess"));
    },
  });

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      <NotificationPrefs
        data={prefs.data?.kinds}
        isLoading={prefs.isLoading}
        onToggle={(kind, enabled) => {
          if (disabled) return;
          set.mutate({ userId, kind, channel: "EMAIL", enabled });
        }}
        onReset={() => reset.mutate({ userId })}
        isResetting={reset.isPending}
        disabled={disabled}
      />
    </PageSection>
  );
}
