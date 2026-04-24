"use client"

import { useState, useTransition } from "react"
import { signInAction } from "./actions"

export function SignInForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")

    startTransition(async () => {
      const result = await signInAction({ email, password })
      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <form
      action={onSubmit}
      className="space-y-3 rounded-lg border border-surface-stroke bg-bg-elevated p-5"
    >
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-text-muted">
          email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-10 w-full rounded-md border border-surface-stroke bg-transparent px-3 text-sm outline-none focus:border-text-muted"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-text-muted">
          password
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10 w-full rounded-md border border-surface-stroke bg-transparent px-3 text-sm outline-none focus:border-text-muted"
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-md border border-surface-stroke bg-text-primary text-sm font-medium text-bg-base transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "signing in…" : "Sign in"}
      </button>
    </form>
  )
}
