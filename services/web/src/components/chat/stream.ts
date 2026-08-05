import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import type { AdvanceStatus, ChatMessageContext } from "./types";

// Consumes the api's `/chat/stream` Server-Sent Events endpoint: POSTs the
// message with the Supabase bearer, then reads the response body as a stream,
// invoking `onToken` for each token frame and resolving with the final result.
// Deliberately not tRPC — the app-wide tRPC client is httpBatch-only, so chat
// streaming rides its own fetch to keep the shared client untouched.

const CONFIGURED_API_URL =
  process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:4000";

export type ChatStreamInput = {
  conversationId?: string;
  content: string;
  context?: ChatMessageContext;
};

export type ChatStreamResult = { conversationId: string; status: AdvanceStatus };

function parseFrame(frame: string): { event: string; data: string } {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  return { event, data: dataLines.join("\n") };
}

export async function streamAssistantReply(
  input: ChatStreamInput,
  handlers: { onToken?: (text: string) => void; signal?: AbortSignal },
): Promise<ChatStreamResult> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const apiUrl = rewriteForCurrentHost(CONFIGURED_API_URL);

  const res = await fetch(`${apiUrl}/chat/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`chat stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatStreamResult | null = null;
  let errorMessage: string | null = null;

  // SSE frames are separated by a blank line ("\n\n").
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (!frame.trim()) continue;
      const { event, data: raw } = parseFrame(frame);
      if (event === "token") {
        const { text } = JSON.parse(raw) as { text: string };
        handlers.onToken?.(text);
      } else if (event === "done") {
        result = JSON.parse(raw) as ChatStreamResult;
      } else if (event === "error") {
        errorMessage = (JSON.parse(raw) as { message?: string }).message ?? "error";
      }
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) throw new Error("chat stream ended without a result");
  return result;
}
