"use client";

import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

function StatusGlyph({ status }: { status: RunStatus }) {
  if (status === "SUCCEEDED")
    return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />;
  if (status === "FAILED")
    return <XCircle className="h-3 w-3 shrink-0 text-destructive" aria-hidden />;
  if (status === "RUNNING")
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-500" aria-hidden />;
  return <PlayCircle className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />;
}

/**
 * Dev-only automation runs feed. Automations execute asynchronously through the
 * outbox + worker, so a broken flow just silently doesn't happen — this surfaces
 * the recent runs (trigger event · status · when · error) and offers a one-tap
 * re-fire of the run's automation. Reuses `automation.runs.list` +
 * `automation.runNow` (both gated on the automation permissions), so it's empty
 * for a caller without automation access rather than erroring loudly.
 */
export function AutomationRunsPanel() {
  const t = useTranslations("devOverlay");
  const locale = useLocale();
  const utils = trpc.useUtils();

  const session = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const signedIn = Boolean(session.data);

  const runsQuery = trpc.automation.runs.list.useQuery(
    { limit: 15 },
    { enabled: signedIn, refetchOnWindowFocus: false, retry: false },
  );
  const runNow = trpc.automation.automations.runNow.useMutation({
    onSuccess: () => void utils.automation.runs.list.invalidate(),
  });

  const runs = runsQuery.data?.items ?? [];
  const failed = runs.filter((r) => r.status === "FAILED").length;

  const badge = (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
        failed > 0 ? "bg-red-400/20 text-red-400" : "bg-border text-muted-foreground"
      }`}
    >
      {failed > 0
        ? t("automation.failedCount", { count: failed })
        : t("automation.runsCount", { count: runs.length })}
    </span>
  );

  return (
    <CollapsibleSection title={t("sections.automation")} badge={badge}>
      {!signedIn ? (
        <p className="text-xs text-muted-foreground">{t("automation.signInPrompt")}</p>
      ) : runsQuery.isError ? (
        <p className="text-xs text-muted-foreground">{t("automation.unavailable")}</p>
      ) : runsQuery.isLoading ? (
        <p className="text-xs opacity-60">…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs opacity-60">{t("automation.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {runs.map((run) => (
            <li key={run.id} className="rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <StatusGlyph status={run.status as RunStatus} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  {run.triggerEventType}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatRelativeTime(run.createdAt, locale)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3"
                  title={t("automation.reRun")}
                  aria-label={t("automation.reRun")}
                  disabled={runNow.isPending}
                  onClick={() => runNow.mutate({ id: run.automationId })}
                >
                  <PlayCircle aria-hidden />
                </Button>
              </div>
              {run.error && (
                <p className="mt-1 break-all text-[10px] text-destructive">{run.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
