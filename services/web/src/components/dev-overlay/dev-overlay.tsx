"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiHealthPanel } from "./panels/api-health";
import { AutomationRunsPanel } from "./panels/automation-runs";
import { CurrentOrgPanel } from "./panels/current-org";
import { EventBusPanel } from "./panels/event-bus";
import { FeatureFlagsPanel } from "./panels/feature-flags";
import { NotificationsPanel } from "./panels/notifications";
import { QueryPlaygroundPanel } from "./panels/query-playground";
import { RbacPanel } from "./panels/rbac";
import { RemoteDiagnosticsPanel } from "./panels/remote-diagnostics";
import { SecretsKeysPanel } from "./panels/secrets-keys";
import { SessionPanel } from "./panels/session";
import { TotpPanel } from "./panels/totp";
import { TrustedDevicesPanel } from "./panels/trusted-devices";
import { WebhookDeliveriesPanel } from "./panels/webhook-deliveries";
import { ThemeToggle } from "./theme-toggle";
import { LocaleToggle } from "./locale-toggle";
import {
  AnchorToggle,
  ANCHOR_BUTTON_CLASS,
  ANCHOR_PANEL_CLASS,
  isOverlayAnchor,
  type OverlayAnchor,
} from "./anchor-toggle";

const ANCHOR_STORAGE_KEY = "dev-overlay-anchor";

export function DevOverlay() {
  const [open, setOpen] = useState(false);
  // Which corner the overlay pins to. Starts at the default so SSR + the first
  // client render agree (no hydration mismatch), then the persisted choice loads
  // in the effect below.
  const [anchor, setAnchor] = useState<OverlayAnchor>("bottom-right");
  const t = useTranslations("devOverlay");

  useEffect(() => {
    const saved = window.localStorage.getItem(ANCHOR_STORAGE_KEY);
    if (isOverlayAnchor(saved)) setAnchor(saved);
  }, []);

  function chooseAnchor(next: OverlayAnchor) {
    setAnchor(next);
    try {
      window.localStorage.setItem(ANCHOR_STORAGE_KEY, next);
    } catch {
      // ignore unavailable storage
    }
  }

  useEffect(() => {
    // Alt+D toggles the overlay. Alt is chosen to avoid common editor / browser
    // shortcuts (Ctrl+D is bookmark, Cmd+D is duplicate).
    function onKey(event: KeyboardEvent) {
      const mod = event.altKey && !event.ctrlKey && !event.metaKey;
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className={`fixed ${ANCHOR_BUTTON_CLASS[anchor]} z-50 h-10 w-10 rounded-full text-muted-foreground shadow-lg hover:text-foreground`}
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
          // `max-w-[calc(100vw-2rem)]` caps the 24rem panel to the viewport
          // minus its 1rem gutter on each side, so it never overflows on a
          // narrow phone regardless of which corner it's anchored to.
          className={`fixed ${ANCHOR_PANEL_CLASS[anchor]} z-50 flex max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-3">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground">{t("title")}</h2>
            <div className="flex items-center gap-2">
              <AnchorToggle anchor={anchor} onChange={chooseAnchor} />
              <LocaleToggle />
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <FeatureFlagsPanel />
            <ApiHealthPanel />
            <RemoteDiagnosticsPanel />
            <EventBusPanel />
            <AutomationRunsPanel />
            <WebhookDeliveriesPanel />
            <QueryPlaygroundPanel />
            <SessionPanel />
            <TrustedDevicesPanel />
            <TotpPanel />
            <NotificationsPanel />
            <SecretsKeysPanel />
            <CurrentOrgPanel />
            <RbacPanel />
          </div>
        </aside>
      )}
    </>
  );
}
