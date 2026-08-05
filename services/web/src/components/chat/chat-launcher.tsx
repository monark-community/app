"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useChat } from "./chat-provider";

// The companion entry point. Lives in the AppBar right cluster (covers desktop +
// mobile, since the AppBar is on every authed surface). Hidden entirely when
// `chat.enabled` is off for the session.
export function ChatLauncherButton() {
  const t = useTranslations("chat");
  const { enabled, toggle, assistantName } = useChat();
  if (!enabled) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("launcherAria", { name: assistantName })}
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
    </Button>
  );
}
