"use client";

import { useLocale, useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

/**
 * Dev-only secrets panel. Lists the org's configured secret *keys* (names +
 * metadata) so you can confirm what `ctx.getSecret` / an automation node will
 * find — values are never shown (write-only by design; `secrets.adminList` is
 * the only procedure that returns secrets and it projects the value out).
 */
export function SecretsKeysPanel() {
  const t = useTranslations("devOverlay");
  const locale = useLocale();

  const session = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const signedIn = Boolean(session.data);

  const secretsQuery = trpc.secrets.adminList.useQuery(undefined, {
    enabled: signedIn,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const secrets = secretsQuery.data ?? [];

  const badge = (
    <span className="rounded-full bg-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {t("secretsKeys.count", { count: secrets.length })}
    </span>
  );

  return (
    <CollapsibleSection title={t("sections.secretsKeys")} badge={badge}>
      {!signedIn ? (
        <p className="text-xs text-muted-foreground">{t("secretsKeys.signInPrompt")}</p>
      ) : secretsQuery.isError ? (
        <p className="text-xs text-muted-foreground">{t("secretsKeys.unavailable")}</p>
      ) : secretsQuery.isLoading ? (
        <p className="text-xs opacity-60">…</p>
      ) : secrets.length === 0 ? (
        <p className="text-xs opacity-60">{t("secretsKeys.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {secrets.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-[11px]">
              <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-mono font-medium">{s.key}</span>
              {s.description && (
                <span className="truncate text-muted-foreground">— {s.description}</span>
              )}
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {s.lastUsedAt
                  ? t("secretsKeys.used", { when: formatRelativeTime(s.lastUsedAt, locale) })
                  : t("secretsKeys.unused")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
