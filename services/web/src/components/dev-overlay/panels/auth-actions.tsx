"use client"

import { useTransition } from "react"
import { signOutAction } from "@/app/signin/actions"

export function AuthActionsPanel() {
  const [isPending, startTransition] = useTransition()

  return (
    <section className="border-t border-surface-stroke p-4">
      <header className="mb-2">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">auth</h3>
      </header>
      <div className="flex gap-2">
        <a
          href="/signup"
          className="flex-1 rounded-md border border-surface-stroke px-3 py-1.5 text-center text-xs text-text-muted hover:text-text-primary"
        >
          sign up
        </a>
        <a
          href="/signin"
          className="flex-1 rounded-md border border-surface-stroke px-3 py-1.5 text-center text-xs text-text-muted hover:text-text-primary"
        >
          sign in
        </a>
        <button
          onClick={() => startTransition(() => signOutAction("local"))}
          disabled={isPending}
          className="flex-1 rounded-md border border-surface-stroke px-3 py-1.5 text-center text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          {isPending ? "…" : "sign out"}
        </button>
      </div>
    </section>
  )
}
