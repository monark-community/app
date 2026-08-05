import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

// Client-side chat types inferred from the tRPC router, so the UI stays in sync
// with the server without a second type source or a package dependency.
type RouterOutputs = inferRouterOutputs<AppRouter>;
type RouterInputs = inferRouterInputs<AppRouter>;

export type ConversationSummary = RouterOutputs["chat"]["conversations"]["list"]["items"][number];
export type MessageView = RouterOutputs["chat"]["messages"]["list"]["items"][number];
export type ToolCallView = MessageView["toolCalls"][number];
export type AdvanceStatus = RouterOutputs["chat"]["messages"]["send"]["status"];
export type ChatMessageContext = NonNullable<RouterInputs["chat"]["messages"]["send"]["context"]>;
