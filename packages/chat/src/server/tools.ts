import { AppError } from "@monark/common";
import type { LlmToolSpec } from "./llm";

// The chat package defines WHAT a tool executor must provide, but not the
// concrete execution — that binds to the app's tRPC router (createCaller over
// appRouter), which lives in services/api and can't be imported here without a
// dependency cycle. So services/api injects a concrete executor at boot via
// `setChatToolExecutor`, mirroring the existing `setWebhookSecretResolver`
// pattern. The agent loop pulls the registered executor to (a) advertise tool
// specs to the model and (b) run a tool call under the live user's session, so
// every tool inherits that user's RBAC automatically.

/** The live user session a tool call runs as. */
export interface ChatUserContext {
  userId: string;
  organizationId: string;
  requestId?: string;
}

/** A tool advertised to the model, plus whether it mutates (drives confirm-gate). */
export type AgentToolSpec = LlmToolSpec & { mutates: boolean };

export type ToolExecuteResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface ChatToolExecutor {
  /** Tool specs to advertise to the model. */
  listSpecs(): AgentToolSpec[];
  /** Look up one spec by tool name (null if unknown). */
  getSpec(toolName: string): AgentToolSpec | null;
  /** Run a tool call under the given user's session. Never throws — a failure
   *  (bad input, RBAC denial, downstream error) resolves to `{ ok: false }` so
   *  the loop can report it back to the model instead of crashing the turn. */
  execute(args: {
    ctx: ChatUserContext;
    toolName: string;
    input: unknown;
  }): Promise<ToolExecuteResult>;
}

let registered: ChatToolExecutor | null = null;

/** Wire the concrete executor (called once at api boot from services/api). */
export function setChatToolExecutor(executor: ChatToolExecutor | null): void {
  registered = executor;
}

/** Get the wired executor, or throw a clear error if the host never wired one. */
export function getChatToolExecutor(): ChatToolExecutor {
  if (!registered) {
    throw new AppError(
      "chat_tools_not_wired",
      "The chat agent's tool executor is not configured (setChatToolExecutor was never called).",
      503,
    );
  }
  return registered;
}
