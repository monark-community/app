"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useChat } from "./chat-provider";
import { MarkdownMessage } from "./markdown-message";
import { MessageItem } from "./message-item";
import { streamAssistantReply } from "./stream";

// A single conversation thread + composer. `conversationId === null` is a fresh,
// unsaved thread: the first send creates the conversation server-side and we
// switch the panel to it. Streaming isn't wired yet (the web tRPC client is
// httpBatch-only), so a send awaits the full turn and we refetch; a "thinking"
// indicator covers the wait. Mutations run as the user, so tool calls the agent
// makes are gated by that user's RBAC server-side.
export function ChatThread({ conversationId }: { conversationId: string | null }) {
  const t = useTranslations("chat");
  const { pageContext, openConversation } = useChat();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight stream if the thread unmounts (panel closed / switched).
  useEffect(() => () => abortRef.current?.abort(), []);

  const messagesQuery = trpc.chat.messages.list.useQuery(
    { conversationId: conversationId ?? "" },
    { enabled: conversationId !== null },
  );

  const invalidate = (id: string) => {
    void utils.chat.messages.list.invalidate({ conversationId: id });
    void utils.chat.conversations.list.invalidate();
  };

  const confirm = trpc.chat.toolCalls.confirm.useMutation({
    onSuccess: () => {
      if (conversationId) invalidate(conversationId);
    },
  });
  const reject = trpc.chat.toolCalls.reject.useMutation({
    onSuccess: () => {
      if (conversationId) invalidate(conversationId);
    },
  });

  const messages = messagesQuery.data?.items ?? [];
  const busy = streaming;

  // Keep the newest message (and the streaming tokens) in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy, optimistic, streamingText]);

  const submit = () => {
    const content = draft.trim();
    if (!content || busy) return;
    setOptimistic(content);
    setDraft("");
    setError(false);
    setStreamingText("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    streamAssistantReply(
      { conversationId: conversationId ?? undefined, content, context: pageContext },
      { onToken: (text) => setStreamingText((prev) => prev + text), signal: controller.signal },
    )
      .then((res) => {
        setStreaming(false);
        setStreamingText("");
        setOptimistic(null);
        invalidate(res.conversationId);
        if (conversationId === null) openConversation(res.conversationId);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStreaming(false);
        setStreamingText("");
        setOptimistic(null);
        setError(true);
      });
  };

  const pendingToolCallId =
    confirm.isPending && confirm.variables
      ? confirm.variables.toolCallId
      : reject.isPending && reject.variables
        ? reject.variables.toolCallId
        : null;

  const showEmpty =
    conversationId !== null &&
    !messagesQuery.isLoading &&
    messages.length === 0 &&
    !optimistic &&
    !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {conversationId !== null && messagesQuery.isLoading ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
            <Skeleton className="h-16 w-4/5 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
          </div>
        ) : null}

        {(conversationId === null || showEmpty) && !optimistic && !busy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{t("threadEmptyHint")}</p>
          </div>
        ) : null}

        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            onConfirmTool={(toolCallId) => confirm.mutate({ toolCallId })}
            onRejectTool={(toolCallId) => reject.mutate({ toolCallId })}
            pendingToolCallId={pendingToolCallId}
          />
        ))}

        {optimistic ? (
          <div className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary/70 px-3.5 py-2 text-sm text-primary-foreground">
              {optimistic}
            </div>
          </div>
        ) : null}

        {streaming ? (
          streamingText ? (
            <div className="flex flex-col items-start gap-2">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-foreground">
                <MarkdownMessage content={streamingText} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("thinking")}
            </div>
          )
        ) : null}

        {error ? <p className="text-sm text-destructive">{t("errorSend")}</p> : null}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={t("composerPlaceholder")}
            className="max-h-40 min-h-11 flex-1 resize-none"
            aria-label={t("composerPlaceholder")}
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={busy || draft.trim().length === 0}
            aria-label={t("send")}
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
