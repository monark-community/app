"use client"

import { listFlagKeys } from "@monark/feature-flags/contracts"
import { trpc } from "@/lib/trpc"

const KEYS = listFlagKeys()

export function FeatureFlagsPanel() {
  const { data, isLoading, error, refetch, isFetching } =
    trpc.featureFlags.getMany.useQuery(
      { keys: KEYS, scope: {} },
      { refetchOnWindowFocus: false },
    )

  return (
    <section className="border-t border-surface-stroke p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">feature flags</h3>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {isFetching ? "…" : "refetch"}
        </button>
      </header>
      {isLoading && <p className="text-xs opacity-60">resolving…</p>}
      {error && (
        <p className="text-xs text-red-400">
          error: <span className="font-mono">{error.message}</span>
        </p>
      )}
      {data && (
        <ul className="space-y-1 text-xs font-mono">
          {KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="truncate">{key}</span>
              <span className={data[key] ? "text-emerald-400" : "text-text-muted"}>
                {data[key] ? "on" : "off"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[10px] text-text-muted">
        resolved against an empty scope (no userId / orgId / role).
      </p>
    </section>
  )
}
