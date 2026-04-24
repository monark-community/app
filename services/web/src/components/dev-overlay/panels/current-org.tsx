"use client"

import { trpc } from "@/lib/trpc"

export function CurrentOrgPanel() {
  const current = trpc.organizations.current.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const mine = trpc.organizations.mine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  const isFetching = current.isFetching || mine.isFetching

  return (
    <section className="border-t border-surface-stroke p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">
          current org
        </h3>
        <button
          onClick={() => {
            void current.refetch()
            void mine.refetch()
          }}
          disabled={isFetching}
          className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {isFetching ? "…" : "refetch"}
        </button>
      </header>
      {current.isLoading && <p className="text-xs opacity-60">resolving…</p>}
      {current.error && (
        <p className="text-xs text-red-400">
          error: <span className="font-mono">{current.error.message}</span>
        </p>
      )}
      {!current.isLoading && !current.error && !current.data && (
        <p className="text-xs text-text-muted">
          no active org (auth context has{" "}
          <span className="font-mono">activeOrganizationId: null</span> until{" "}
          <code>@monark/auth</code> wires the session claim).
        </p>
      )}
      {current.data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
          <dt className="text-text-muted">slug</dt>
          <dd className="truncate">{current.data.slug}</dd>
          <dt className="text-text-muted">name</dt>
          <dd className="truncate">{current.data.displayName}</dd>
          <dt className="text-text-muted">id</dt>
          <dd className="truncate">{current.data.id}</dd>
        </dl>
      )}
      {mine.data && mine.data.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-text-muted">
            memberships ({mine.data.length})
          </p>
          <ul className="space-y-1 text-xs font-mono">
            {mine.data.map((org) => (
              <li key={org.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{org.slug}</span>
                <span className="truncate text-text-muted">{org.displayName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
