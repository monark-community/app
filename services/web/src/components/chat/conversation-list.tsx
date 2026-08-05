"use client";

import { MessageSquareText, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format-time";
import { useChat } from "./chat-provider";

// The conversation list — screen 1 of the panel. Today the only "contact" is the
// AI assistant, but the substrate is multi-participant, so this is where human
// conversations will appear later with no rework.
export function ConversationList() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const { openConversation, startNewConversation, assistantName } = useChat();
  const query = trpc.chat.conversations.list.useQuery({});

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-1 p-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items = query.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">{t("emptyHint", { name: assistantName })}</p>
        <Button onClick={startNewConversation}>{t("newConversation")}</Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 overflow-y-auto p-2">
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => openConversation(c.id)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted focus:bg-muted focus:outline-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <MessageSquareText className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {c.title ?? t("untitled")}
              </span>
              {c.lastMessageAt ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {formatRelativeTime(c.lastMessageAt, locale)}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
