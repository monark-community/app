"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageSection } from "@/components/page-section";
import { NotificationPrefs } from "@/components/notification-prefs";
import { trpc } from "@/lib/trpc";

export function NotificationsSection() {
  const t = useTranslations("account.notifications.prefs");
  const utils = trpc.useUtils();

  const prefs = trpc.notifications.preferences.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const set = trpc.notifications.preferences.set.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.get.invalidate();
    },
  });
  const reset = trpc.notifications.preferences.reset.useMutation({
    onSuccess: () => {
      void utils.notifications.preferences.get.invalidate();
      toast.success(t("resetSuccess"));
    },
  });

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      <NotificationPrefs
        data={prefs.data?.kinds}
        isLoading={prefs.isLoading}
        onToggle={(kind, enabled) => set.mutate({ kind, channel: "EMAIL", enabled })}
        onReset={() => reset.mutate()}
        isResetting={reset.isPending}
      />
    </PageSection>
  );
}
