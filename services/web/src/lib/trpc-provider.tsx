"use client"

import { useEffect, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { rewriteForCurrentHost } from "./dev-host-rewrite"
import { createSupabaseBrowserClient } from "./supabase/browser"
import { trpc } from "./trpc"

const CONFIGURED_API_URL =
  process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:4000"

export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [supabase] = useState(() => createSupabaseBrowserClient())
  const [trpcClient] = useState(() => {
    // Resolved at client-init time so the loopback-host rewrite runs
    // against the browser's actual `window.location` ; in dev this
    // makes phone-from-LAN testing work without env edits, in prod
    // it's a no-op because the configured URL doesn't point to
    // localhost.
    const apiUrl = rewriteForCurrentHost(CONFIGURED_API_URL)
    return trpc.createClient({
      links: [
        httpBatchLink({
          url: `${apiUrl}/trpc`,
          async headers() {
            const { data } = await supabase.auth.getSession()
            const token = data.session?.access_token
            return token ? { authorization: `Bearer ${token}` } : {}
          },
        }),
      ],
    })
  })

  // Server-action sign-in / sign-out uses redirect(), which is a soft
  // navigation in Next App Router; the QueryClient survives, so anything
  // that depended on the previous auth state (users.me, rbac, etc.) stays
  // cached with the stale result. Invalidate on auth transitions.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        queryClient.invalidateQueries()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase, queryClient])

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
