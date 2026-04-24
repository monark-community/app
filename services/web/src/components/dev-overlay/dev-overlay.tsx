"use client"

import { useEffect, useState } from "react"
import { ApiHealthPanel } from "./panels/api-health"
import { CurrentOrgPanel } from "./panels/current-org"
import { CurrentUserPanel } from "./panels/current-user"
import { FeatureFlagsPanel } from "./panels/feature-flags"

export function DevOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Alt+D toggles the overlay. Alt is chosen to avoid common editor / browser
    // shortcuts (Ctrl+D is bookmark, Cmd+D is duplicate).
    function onKey(event: KeyboardEvent) {
      const mod = event.altKey && !event.ctrlKey && !event.metaKey
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (process.env.NODE_ENV === "production") return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-surface-stroke bg-bg-elevated font-mono text-xs text-text-muted shadow-lg transition hover:text-text-primary"
        aria-label={open ? "Close dev overlay" : "Open dev overlay"}
        aria-expanded={open}
        title="Alt+D"
      >
        {open ? "×" : "dev"}
      </button>

      {open && (
        <aside
          role="dialog"
          aria-label="Dev overlay"
          className="fixed bottom-16 right-4 z-50 flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-lg border border-surface-stroke bg-bg-elevated shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-surface-stroke px-4 py-2">
            <h2 className="text-xs uppercase tracking-wider text-text-muted">
              dev overlay
            </h2>
            <span className="text-[10px] text-text-muted">Alt+D to toggle</span>
          </header>
          <div className="flex-1 overflow-y-auto">
            <ApiHealthPanel />
            <CurrentUserPanel />
            <CurrentOrgPanel />
            <FeatureFlagsPanel />
          </div>
        </aside>
      )}
    </>
  )
}
