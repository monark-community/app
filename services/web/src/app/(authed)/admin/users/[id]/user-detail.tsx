"use client";

import { useLocale, useTranslations } from "next-intl";
import { Clock, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSection } from "@/components/page-section";
import { trpc } from "@/lib/trpc";
import { AdminAccountActions } from "./admin-account-actions";
import { AdminDangerZone } from "./admin-danger-zone";
import { AdminNotifications } from "./admin-notifications";
import { AdminProfileForm } from "./admin-profile-form";
import { AdminRoles } from "./admin-roles";

function formatDate(date: Date | string | null, locale: string): string {
  if (!date) return "";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString([locale, "en"], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function UserDetail({
  userId,
  containment = "viewport",
}: {
  userId: string;
  containment?: "viewport" | "container";
}) {
  const t = useTranslations("admin.users.detail");
  const tBadges = useTranslations("admin.users.badges");
  const locale = useLocale();
  // In panel mode the panel's own header owns the back affordance, so the
  // profile banner drops its back overlay.
  const inPanel = containment === "container";
  const query = trpc.users.adminGetUser.useQuery({ userId }, { refetchOnWindowFocus: false });

  if (query.isLoading) {
    return (
      <section className="space-y-8">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section className="space-y-4">
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </p>
      </section>
    );
  }

  const user = query.data.user;
  const badges = (
    <>
      {user.disabledAt && (
        <Badge variant="secondary">
          <ShieldOff className="h-3 w-3" aria-hidden />
          {tBadges("disabled")}
        </Badge>
      )}
      {user.deletedAt && (
        <Badge variant="warning">
          <Clock className="h-3 w-3" aria-hidden />
          {tBadges("pendingDeletion")}
        </Badge>
      )}
    </>
  );

  return (
    <section className="space-y-8">
      <AdminProfileForm
        user={user}
        badges={badges}
        backHref={inPanel ? undefined : "/admin/users"}
        backLabel={inPanel ? undefined : t("back")}
        bleed={inPanel ? "container" : true}
      />

      <Separator />

      <PageSection title={t("identity.title")}>
        <dl className="space-y-2 text-sm">
          <Row label={t("identity.id")} value={user.id} />
          <Row label={t("identity.email")} value={user.email} />
          <Row
            label={t("identity.emailVerified")}
            value={user.emailVerifiedAt ? t("yes") : t("no")}
          />
          <Row label={t("identity.createdAt")} value={formatDate(user.createdAt, locale)} />
          {user.deletedAt && (
            <Row label={t("identity.deletedAt")} value={formatDate(user.deletedAt, locale)} />
          )}
        </dl>
      </PageSection>

      <Separator />

      <AdminRoles
        userId={user.id}
        assignments={query.data.assignments}
        disabled={Boolean(user.deletedAt)}
      />

      <Separator />

      <AdminAccountActions userId={user.id} email={user.email} disabled={Boolean(user.deletedAt)} />

      <Separator />

      <AdminNotifications userId={user.id} disabled={Boolean(user.deletedAt)} />

      <AdminDangerZone userId={user.id} email={user.email} deletedAt={user.deletedAt} />
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
