"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { PanelHeader } from "@/components/patterns";
import { usePanelIsMobile, useScreenWidth } from "@/hooks/use-panel-is-mobile";
import { useChat } from "./chat-provider";
import { ChatThread } from "./chat-thread";
import { ConversationList } from "./conversation-list";

// The docked companion surface. Non-modal on desktop (the app stays interactive
// behind it — the TableDetailLayout pattern) and a full-screen takeover on
// mobile. Switches between the conversation LIST and a single THREAD; the
// PanelHeader's back arrow returns to the list.
export function ChatPanel() {
  const t = useTranslations("chat");
  const isMobile = usePanelIsMobile(useScreenWidth());
  const { open, closePanel, view, showList, startNewConversation, assistantName } = useChat();
  const inThread = view.mode === "thread";

  return (
    <Sheet
      open={open}
      modal={isMobile}
      onOpenChange={(next) => {
        if (!next) closePanel();
      }}
    >
      <SheetContent
        side={isMobile ? "full" : "right"}
        overlay={isMobile}
        hideClose
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">{assistantName}</SheetTitle>
        <PanelHeader
          title={inThread ? assistantName : t("conversationsTitle")}
          onClose={closePanel}
          left={inThread ? { mode: "back", onBack: showList, label: t("back") } : undefined}
          actions={[
            { icon: Plus, label: t("newConversation"), onSelect: startNewConversation },
          ]}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          {inThread ? (
            <ChatThread conversationId={view.conversationId} />
          ) : (
            <ConversationList />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
