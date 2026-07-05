"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

export function FeatureFlagsPanel() {
  const t = useTranslations("devOverlay");
  // Resolve every registered flag at the caller's own session scope. The
  // flag-key registry is server-only (populated at api boot), so the keys
  // come back with the query rather than a client-side `listFlagKeys()`
  // (which is always empty in the browser).
  const { data, isLoading, error, refetch, isFetching } =
    trpc.featureFlags.getAllForSession.useQuery(undefined, { refetchOnWindowFocus: false });

  const keys = data ? Object.keys(data).sort() : [];
  const onCount = keys.filter((k) => data?.[k]).length;
  const badge = data ? (
    <span className="rounded-full bg-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {t("badges.flagsOn", { on: onCount, total: keys.length })}
    </span>
  ) : null;

  return (
    <CollapsibleSection title={t("sections.featureFlags")} badge={badge}>
      <div className="space-y-3">
        {isLoading && <p className="text-xs opacity-60">{t("featureFlags.resolving")}</p>}
        {error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")} <span className="font-mono">{error.message}</span>
          </p>
        )}
        {data && keys.length > 0 && (
          <ul className="space-y-1 text-xs font-mono">
            {keys.map((key) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span className="truncate">{key}</span>
                <span className={data[key] ? "text-emerald-400" : "text-muted-foreground"}>
                  {data[key] ? t("featureFlags.on") : t("featureFlags.off")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data && keys.length === 0 && (
          <p className="text-xs opacity-60">{t("featureFlags.empty")}</p>
        )}
        <p className="text-[10px] text-muted-foreground">{t("featureFlags.scopeNote")}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {isFetching ? "…" : t("refetch")}
        </Button>
      </div>
    </CollapsibleSection>
  );
}
