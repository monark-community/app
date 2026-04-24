"use client"

import { trpc } from "@/lib/trpc"

export function PingStatus() {
  const { data, isLoading, error } = trpc.auth.ping.useQuery()

  if (isLoading) {
    return <p className="text-sm opacity-70">pinging api…</p>
  }

  if (error) {
    return (
      <p className="text-sm text-red-400">
        api error: <span className="font-mono">{error.message}</span>
      </p>
    )
  }

  return (
    <p className="text-sm opacity-70">
      api said{" "}
      <span className="font-mono text-[color:var(--color-text-primary)]">
        {data?.pong ? "pong" : "no pong"}
      </span>{" "}
      at <span className="font-mono">{data?.at}</span>
    </p>
  )
}
