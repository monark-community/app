"use client";

import { MarkdownMessage } from "./markdown-message";
import { ToolCallCard } from "./tool-call-card";
import type { MessageView } from "./types";

// One message row. USER messages are right-aligned solid bubbles; AI_AGENT
// messages are left-aligned muted bubbles, followed by any tool-call cards the
// assistant produced on that turn. (TOOL-authored rows aren't emitted — tool
// results live on the assistant message's tool calls.)
export function MessageItem({
  message,
  onConfirmTool,
  onRejectTool,
  pendingToolCallId,
}: {
  message: MessageView;
  onConfirmTool: (toolCallId: string) => void;
  onRejectTool: (toolCallId: string) => void;
  pendingToolCallId: string | null;
}) {
  if (message.authorType === "USER") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.authorType !== "AI_AGENT") return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {message.content ? (
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-foreground">
          <MarkdownMessage content={message.content} />
        </div>
      ) : null}
      {message.toolCalls.map((tc) => (
        <div key={tc.id} className="w-[85%]">
          <ToolCallCard
            toolCall={tc}
            onConfirm={() => onConfirmTool(tc.id)}
            onReject={() => onRejectTool(tc.id)}
            pending={pendingToolCallId === tc.id}
          />
        </div>
      ))}
    </div>
  );
}
