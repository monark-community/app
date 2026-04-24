"use client"

import { trpc } from "@/lib/trpc"

export function CurrentUserPanel() {
  const { data, isLoading, error, refetch, isFetching } = trpc.users.me.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  )

  return (
    <section className="border-t border-surface-stroke p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">current user</h3>
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
      {!isLoading && !error && !data && (
        <p className="text-xs text-text-muted">
          not signed in (auth context returns <span className="font-mono">userId: null</span>{" "}
          until <code>@monark/auth</code> wires session verification).
        </p>
      )}
      {data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
          <dt className="text-text-muted">id</dt>
          <dd className="truncate">{data.id}</dd>
          <dt className="text-text-muted">email</dt>
          <dd className="truncate">{data.email}</dd>
          <dt className="text-text-muted">name</dt>
          <dd className="truncate">{data.displayName ?? "—"}</dd>
          <dt className="text-text-muted">locale</dt>
          <dd>{data.localePreference}</dd>
        </dl>
      )}
    </section>
  )
}
