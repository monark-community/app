"use client";

import { AlertCircle, Check, Loader2, Wrench, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolCallView } from "./types";

// Turn a tool name (e.g. "monark_create_record") into a human phrase
// ("create record") for the "wants to …" line.
function humanizeTool(name: string): string {
  return name.replace(/^monark_/, "").replace(/_/g, " ");
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
  const action = humanizeTool(toolCall.toolName);
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
