"use client"

import { useMemo, useState, useTransition } from "react"
import {
  checkPasswordOffline,
  PASSWORD_RULE_HINTS,
  type PasswordFailureReason,
} from "@monark/auth/contracts"
import { signUpAction } from "./actions"

const OFFLINE_HINT_ORDER: Array<Exclude<PasswordFailureReason, "breached">> = [
  "too-short",
  "not-enough-char-classes",
  "contains-email",
  "contains-display-name",
]

export function SignUpForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const strength = useMemo(
    () =>
      checkPasswordOffline(password, {
        email: email || undefined,
        displayName: displayName || undefined,
      }),
    [password, email, displayName],
  )
  const failing = strength.ok ? new Set<PasswordFailureReason>() : new Set(strength.reasons)
  const showHints = password.length > 0

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await signUpAction({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        displayName: String(formData.get("displayName") ?? "") || undefined,
      })
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 w-full rounded-md border border-surface-stroke bg-transparent px-3 text-sm outline-none focus:border-text-muted"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-text-muted">
          display name (optional)
        </span>
        <input
          name="displayName"
          type="text"
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="h-10 w-full rounded-md border border-surface-stroke bg-transparent px-3 text-sm outline-none focus:border-text-muted"
        />
      </label>

      {showHints && (
        <ul className="space-y-1 text-[11px]">
          {OFFLINE_HINT_ORDER.map((reason) => {
            const missing = failing.has(reason)
            return (
              <li
                key={reason}
                className={missing ? "text-text-muted" : "text-emerald-400"}
              >
                <span className="mr-1.5 inline-block w-3 font-mono">
                  {missing ? "·" : "✓"}
                </span>
                {PASSWORD_RULE_HINTS[reason]}
              </li>
            )
          })}
          <li className="text-[10px] text-text-muted">
            Also checked on submit: your password isn&apos;t on a public breach list.
          </li>
        </ul>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isPending || !strength.ok}
        className="h-11 w-full rounded-md border border-surface-stroke bg-text-primary text-sm font-medium text-bg-base transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "creating account…" : "Create account"}
      </button>
    </form>
  )
}
