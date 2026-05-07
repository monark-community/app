"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Wrench, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiHealthPanel } from "./panels/api-health"
import { CurrentOrgPanel } from "./panels/current-org"
import { FeatureFlagsPanel } from "./panels/feature-flags"
import { NotificationsPanel } from "./panels/notifications"
import { RbacPanel } from "./panels/rbac"
import { RemoteDiagnosticsPanel } from "./panels/remote-diagnostics"
import { SessionPanel } from "./panels/session"
import { TotpPanel } from "./panels/totp"
import { TrustedDevicesPanel } from "./panels/trusted-devices"
import { ThemeToggle } from "./theme-toggle"
import { LocaleToggle } from "./locale-toggle"

export function DevOverlay() {
  const [open, setOpen] = useState(false)
  const t = useTranslations("devOverlay")

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
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full text-muted-foreground shadow-lg hover:text-foreground"
        aria-label={t("title")}
        aria-expanded={open}
        title={t("toggleHint")}
      >
        {open ? <X /> : <Wrench />}
      </Button>

      {open && (
        <aside
          role="dialog"
          aria-label={t("title")}
          className="fixed bottom-16 right-4 z-50 flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-3">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("title")}
            </h2>
            <div className="flex items-center gap-2">
              <LocaleToggle />
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <FeatureFlagsPanel />
            <ApiHealthPanel />
            <RemoteDiagnosticsPanel />
            <SessionPanel />
            <TrustedDevicesPanel />
            <TotpPanel />
            <NotificationsPanel />
            <CurrentOrgPanel />
            <RbacPanel />
          </div>
        </aside>
      )}
    </>
  )
}
