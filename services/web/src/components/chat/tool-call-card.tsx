"use client";

import { AlertCircle, ArrowRight, Check, Loader2, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePanelIsMobile, useScreenWidth } from "@/hooks/use-panel-is-mobile";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-provider";
import type { ToolCallView } from "./types";

// Tools with a curated, localized action phrase (`chat.toolActions.<name>`).
// Anything not listed falls back to `humanizeTool`. Keep in sync with the tool
// names in services/api/src/chat/{tools,automation-tools}.ts.
const LABELLED_TOOLS = new Set<string>([
  "monark_whoami",
  "monark_list_models",
  "monark_get_model",
  "monark_list_model_fields",
  "monark_list_records",
  "monark_get_record",
  "monark_create_record",
  "monark_update_record",
  "monark_delete_record",
  "automation_list",
  "automation_get",
  "automation_list_node_types",
  "automation_list_trigger_events",
  "automation_create",
  "automation_update",
  "automation_enable",
  "automation_test",
  "automation_get_run",
  "wiki_list_pages",
  "wiki_get_page",
  "wiki_search",
  "wiki_create_page",
  "wiki_update_page",
  "wiki_move_page",
  "wiki_delete_page",
  "list_destinations",
  "navigate",
]);

// Fallback for an unmapped tool: "monark_create_record" → "create record".
function humanizeTool(name: string): string {
  return name.replace(/^monark_/, "").replace(/_/g, " ");
}

// The `navigate` tool's result: a validated in-app path + a human label.
function asNavTarget(result: unknown): { url: string; label: string } | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.url === "string" && typeof r.label === "string"
    ? { url: r.url, label: r.label }
    : null;
}

// Renders one agent tool call inside an assistant message. A read-only call just
// shows its terminal status; a mutating call in PROPOSED shows confirm/reject
// (the confirm-each-write gate).
export function ToolCallCard({
  toolCall,
  onConfirm,
  onReject,
  pending,
}: {
  toolCall: ToolCallView;
  onConfirm: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const { closePanel } = useChat();
  const isMobile = usePanelIsMobile(useScreenWidth());

  // The `navigate` tool renders as a single "Go to {label}" button — the click
  // is the user's confirmation, so there's no auto-redirect. On mobile the panel
  // closes so the destination is visible; on desktop the companion stays open.
  const navTarget = toolCall.toolName === "navigate" ? asNavTarget(toolCall.result) : null;
  if (navTarget && toolCall.status === "SUCCEEDED") {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
        <Button
          size="sm"
          onClick={() => {
            router.push(navTarget.url);
            if (isMobile) closePanel();
          }}
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          {t("navGo", { label: navTarget.label })}
        </Button>
      </div>
    );
  }

  const action = LABELLED_TOOLS.has(toolCall.toolName)
    ? t(`toolActions.${toolCall.toolName}`)
    : humanizeTool(toolCall.toolName);
  const isProposed = toolCall.status === "PROPOSED";
  const isRunning = toolCall.status === "EXECUTING" || pending;
  const isError = toolCall.status === "FAILED";

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        isProposed ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40",
        isError && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : toolCall.status === "SUCCEEDED" ? (
            <Check className="h-4 w-4 text-primary" aria-hidden />
          ) : isError ? (
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
          ) : toolCall.status === "REJECTED" ? (
            <X className="h-4 w-4" aria-hidden />
          ) : (
            <Wrench className="h-4 w-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{t("toolWantsTo", { action })}</p>
          {isError && toolCall.errorMessage ? (
            <p className="mt-0.5 text-xs text-destructive">{toolCall.errorMessage}</p>
          ) : null}
          {toolCall.status === "SUCCEEDED" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("toolSucceeded")}</p>
          ) : null}
          {toolCall.status === "REJECTED" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("toolRejected")}</p>
          ) : null}
        </div>
      </div>

      {isProposed ? (
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onReject} disabled={pending}>
            {t("toolReject")}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {t("toolConfirm")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
