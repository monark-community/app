"use client"

import { trpc } from "@/lib/trpc"

export function ApiHealthPanel() {
  const { data, isLoading, error, refetch, isFetching } = trpc.auth.ping.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  )

  return (
    <section className="border-t border-surface-stroke p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">api health</h3>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {isFetching ? "…" : "refetch"}
        </button>
      </header>
      {isLoading && <p className="text-xs opacity-60">pinging…</p>}
      {error && (
        <p className="text-xs text-red-400">
          error: <span className="font-mono">{error.message}</span>
        </p>
      )}
      {data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
          <dt className="text-text-muted">pong</dt>
          <dd>{String(data.pong)}</dd>
          <dt className="text-text-muted">at</dt>
          <dd className="truncate">{data.at}</dd>
        </dl>
      )}
    </section>
  )
}
