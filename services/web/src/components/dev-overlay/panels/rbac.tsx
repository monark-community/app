"use client"

import { trpc } from "@/lib/trpc"

export function RbacPanel() {
  const roles = trpc.rbac.myRoles.useQuery(undefined, { refetchOnWindowFocus: false })
  const primary = trpc.rbac.myPrimaryRole.useQuery(undefined, { refetchOnWindowFocus: false })
  const perms = trpc.rbac.myPermissions.useQuery(undefined, { refetchOnWindowFocus: false })

  const isFetching = roles.isFetching || primary.isFetching || perms.isFetching

  return (
    <section className="border-t border-surface-stroke p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">rbac</h3>
        <button
          onClick={() => {
            void roles.refetch()
            void primary.refetch()
            void perms.refetch()
          }}
          disabled={isFetching}
          className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {isFetching ? "…" : "refetch"}
        </button>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
        <dt className="text-text-muted">primary</dt>
        <dd className="truncate">{primary.data ?? "—"}</dd>
        <dt className="text-text-muted">roles</dt>
        <dd className="truncate">
          {roles.data && roles.data.length > 0 ? roles.data.join(", ") : "—"}
        </dd>
      </dl>

      <div className="mt-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-text-muted">
          permissions ({perms.data?.length ?? 0})
        </p>
        {perms.data && perms.data.length > 0 ? (
          <ul className="space-y-0.5 text-[11px] font-mono">
            {perms.data.map((p) => (
              <li key={p} className="text-emerald-400">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">
            none granted (no userId / org context until <code>@monark/auth</code> wires the session).
          </p>
        )}
      </div>
    </section>
  )
}
