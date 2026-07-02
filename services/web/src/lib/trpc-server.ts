import "server-only";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../api/src/trpc/router";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:4000";

// Vanilla (non-React) tRPC client for server-actions / route-handlers.
// Pass the current Supabase access token if the mutation needs ctx.userId.
export function createServerTrpcClient(accessToken?: string | null) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
      }),
    ],
  });
}
