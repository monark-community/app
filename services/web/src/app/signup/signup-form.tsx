"use client"

import { useState, useTransition } from "react"
import { signUpAction } from "./actions"

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")
    const displayName = String(formData.get("displayName") ?? "") || undefined

    startTransition(async () => {
      const result = await signUpAction({ email, password, displayName })
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
          minLength={12}
          autoComplete="new-password"
          className="h-10 w-full rounded-md border border-surface-stroke bg-transparent px-3 text-sm outline-none focus:border-text-muted"
        />
        <span className="mt-1 block text-[10px] text-text-muted">12 characters minimum.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-text-muted">
          display name (optional)
        </span>
        <input
          name="displayName"
          type="text"
          maxLength={80}
          className="h-10 w-full rounded-md border border-surface-stroke bg-transparent px-3 text-sm outline-none focus:border-text-muted"
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-md border border-surface-stroke bg-text-primary text-sm font-medium text-bg-base transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "creating account…" : "Create account"}
      </button>
    </form>
  )
}
