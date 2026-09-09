"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { ChatPanel } from "./chat-panel";

// Global, always-mounted chat companion. Mirrors GlobalSearchProvider: holds the
// open state + which conversation is active, registers the Cmd/Ctrl+J shortcut,
// exposes `useChat()`, and renders the docked panel as its last child so it
// persists across route navigation. Gated by the `chat.enabled` flag — when off,
// the launcher hides and opening is a no-op.

/** What the panel is currently showing. */
export type ChatView = { mode: "list" } | { mode: "thread"; conversationId: string | null }; // null = a fresh, unsaved thread

export type ChatPageContext = {
  route?: string;
  focus?: { model?: string; recordId?: string };
};

type ChatContextValue = {
  enabled: boolean;
  assistantName: string;
  open: boolean;
  view: ChatView;
  /** Best-effort "where the user is", sent with each message. */
  pageContext: ChatPageContext;
  openPanel: () => void;
  closePanel: () => void;
  toggle: () => void;
  showList: () => void;
  openConversation: (conversationId: string) => void;
  startNewConversation: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within <ChatProvider>");
  return ctx;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ChatView>({ mode: "list" });
  const pathname = usePathname();
  const t = useTranslations("chat");

  // Optimistic flag read: treat missing as ON, only disable when explicitly
  // false (the flag registry is server-only, same convention as usePrimaryNav).
  const flags =
    trpc.featureFlags.getAllForSession.useQuery(undefined, {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }).data ?? {};
  const enabled = flags["chat.enabled"] !== false;

  // The assistant's display name, resolved server-side (per-org override →
  // CHAT_ASSISTANT_NAME → the shipped default). The in-flight fallback is the
  // generic translated noun, deliberately *not* the shipped default: hardcoding
  // "Chrysa" here made a deploy that renamed its assistant flash the Monark
  // brand on every first paint.
  const assistantName =
    trpc.chat.config.useQuery(undefined, {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }).data?.assistantName ?? t("assistantFallbackName");

  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const showList = useCallback(() => setView({ mode: "list" }), []);
  const openConversation = useCallback((conversationId: string) => {
    setView({ mode: "thread", conversationId });
    setOpen(true);
  }, []);
  const startNewConversation = useCallback(() => {
    setView({ mode: "thread", conversationId: null });
    setOpen(true);
  }, []);

  // Cmd/Ctrl+J toggles the panel (Cmd+K is global search).
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, toggle]);

  const pageContext = useMemo<ChatPageContext>(
    () => ({ route: pathname ?? undefined }),
    [pathname],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      enabled,
      assistantName,
      open,
      view,
      pageContext,
      openPanel,
      closePanel,
      toggle,
      showList,
      openConversation,
      startNewConversation,
    }),
    [
      enabled,
      assistantName,
      open,
      view,
      pageContext,
      openPanel,
      closePanel,
      toggle,
      showList,
      openConversation,
      startNewConversation,
    ],
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
      {enabled ? <ChatPanel /> : null}
    </ChatContext.Provider>
  );
}
