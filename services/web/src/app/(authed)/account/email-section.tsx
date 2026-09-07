"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSection } from "@/components/page-section";
import { trpc } from "@/lib/trpc";
import { EmailChangeForm } from "./email-change-form";

export function EmailSection() {
  const t = useTranslations("account.email");
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const identities = trpc.auth.oauth.identities.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const email = me.data?.email ?? "";

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-2">
        <Label htmlFor="emailReadonly">{t("currentLabel")}</Label>
        {me.isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Input id="emailReadonly" value={email} readOnly disabled className="bg-muted" />
        )}
      </div>
      {/* Changing the address is gated on re-entering the current
          password, which a social-only account doesn't have. Rather
          than invent a second re-auth channel, point the user at the
          "Set a password" card directly below ; once they have one,
          the normal flow applies. */}
      {email &&
        (identities.isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : identities.data?.hasPassword ? (
          <EmailChangeForm currentEmail={email} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("needsPassword")}</p>
        ))}
    </PageSection>
  );
}
