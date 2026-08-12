"use client";

import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Discord is a write-only integration: automation nodes post messages using a
 * bot token or a channel webhook URL kept in the secrets substrate. There's no
 * per-org connection to manage (no inbound webhook), so this panel is purely
 * informational — how to get a credential + where to store it.
 */
export function DiscordSettings() {
  const t = useTranslations("discord");
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
          <MessagesSquare className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">{t("writeOnlyHeading")}</h3>
        <p className="text-sm text-muted-foreground">{t("writeOnly")}</p>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">{t("secretsHeading")}</h3>
        <p className="text-sm text-muted-foreground">{t("secrets")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/secrets">{t("secretsLink")}</Link>
        </Button>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">{t("setupHeading")}</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
      </section>
    </div>
  );
}
