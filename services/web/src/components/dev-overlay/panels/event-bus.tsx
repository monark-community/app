"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

/**
 * Dev-only live feed of emitted domain events — the backbone the automation,
 * webhook, and notification side-effects all hang off, otherwise invisible at
 * runtime. Polls the API's in-memory ring buffer (populated by a wildcard bus
 * subscriber installed at boot in dev) so you can see what fired when you did
 * something. Read-only; the buffer is capped and never persisted.
 */
export function EventBusPanel() {
  const t = useTranslations("devOverlay");
  const locale = useLocale();

  const session = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const signedIn = Boolean(session.data);

  const eventsQuery = trpc.automation.dev.recentEvents.useQuery(undefined, {
    enabled: signedIn,
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const events = eventsQuery.data?.events ?? [];

  const badge = (
    <span className="rounded-full bg-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {t("eventBus.count", { count: events.length })}
    </span>
  );

  return (
    <CollapsibleSection title={t("sections.eventBus")} badge={badge}>
      {!signedIn ? (
        <p className="text-xs text-muted-foreground">{t("eventBus.signInPrompt")}</p>
      ) : events.length === 0 ? (
        <p className="text-xs opacity-60">{t("eventBus.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.seq} className="rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
                  {e.type}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatRelativeTime(e.occurredAt, locale)}
                </span>
              </div>
              {e.summary && e.summary !== "{}" && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
                  {e.summary}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
