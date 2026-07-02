"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/lib/supabase/storage-key";
import { CollapsibleSection } from "../collapsible-section";

type CheckStatus = "pending" | "ok" | "fail";

type CheckResult = {
  name: string;
  url: string;
  configured: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
};

type AuthProbe = {
  status: CheckStatus;
  cookieNames: string[];
  hasSession: boolean | null;
  sessionUserId: string | null;
  meResult: string;
  hint?: string;
  hasStaleAuthCookie?: boolean;
};

const CONFIGURED_API =
  process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:4000";

const CONFIGURED_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function StatusGlyph({ status }: { status: CheckStatus }) {
  if (status === "pending") {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />;
  }
  if (status === "ok") {
    return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />;
  }
  return <XCircle className="h-3 w-3 shrink-0 text-destructive" aria-hidden />;
}

function detectStaleAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some(
    (name) =>
      name.startsWith("sb-") &&
      name.includes("-auth-token") &&
      !name.split(".")[0]!.startsWith(SUPABASE_AUTH_STORAGE_KEY),
  );
}

function clearAllSbCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (!name || !name.startsWith("sb-")) continue;
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

/**
 * Compact dev-overlay version of the standalone /dev-diagnostics page.
 *
 * Diagnoses the "phone (or any LAN device) opens the app and things
 * silently misbehave" class of bug — from the device that's actually
 * having the problem. Probes :
 *
 *   - Reachability of web / api / Supabase from this browser, with the
 *     resolved URL the dev-host rewrite produced.
 *   - Auth state on this device : cookie names visible to JS, whether
 *     `getSession()` returned anything, the resolved user id, and the
 *     result of an authed `users.me` tRPC call.
 *
 * Detects the "stale storage-key cookie" recovery scenario and
 * surfaces a one-tap "clear + re-sign-in" button rather than dropping
 * a wall of generic advice.
 *
 * Production : the parent `<DevOverlay>` returns null in production,
 * so this panel never ships to end users.
 */
export function RemoteDiagnosticsPanel() {
  const t = useTranslations("devOverlay");
  const [browserHost, setBrowserHost] = useState("");
  const [authProbe, setAuthProbe] = useState<AuthProbe>({
    status: "pending",
    cookieNames: [],
    hasSession: null,
    sessionUserId: null,
    meResult: "",
  });
  const [checks, setChecks] = useState<CheckResult[]>(() => [
    { name: "web", url: "", configured: "n/a", status: "pending", detail: "" },
    { name: "api", url: "", configured: CONFIGURED_API, status: "pending", detail: "" },
    {
      name: "supabase",
      url: "",
      configured: CONFIGURED_SUPABASE,
      status: "pending",
      detail: "",
    },
  ]);

  useEffect(() => {
    setBrowserHost(window.location.host);
    const apiUrl = `${rewriteForCurrentHost(CONFIGURED_API)}/health`;
    const supabaseUrl = `${rewriteForCurrentHost(CONFIGURED_SUPABASE)}/auth/v1/health`;
    const webUrl = window.location.origin;

    setChecks((prev) => {
      const next = [...prev];
      next[0] = {
        ...next[0]!,
        url: webUrl,
        status: "ok",
        detail: webUrl,
      };
      next[1] = { ...next[1]!, url: apiUrl };
      next[2] = { ...next[2]!, url: supabaseUrl };
      return next;
    });

    fetch(apiUrl, { method: "GET", credentials: "include" })
      .then(async (res) => {
        const body = await res.text().catch(() => "");
        setChecks((prev) => {
          const next = [...prev];
          next[1] = {
            ...next[1]!,
            status: res.ok ? "ok" : "fail",
            detail: `${res.status} ${body.slice(0, 60)}`,
            hint: res.ok ? undefined : t("remoteDiagnostics.hints.apiRejected"),
          };
          return next;
        });
      })
      .catch((err) => {
        setChecks((prev) => {
          const next = [...prev];
          next[1] = {
            ...next[1]!,
            status: "fail",
            detail: err instanceof Error ? err.message : String(err),
            hint: t("remoteDiagnostics.hints.apiUnreachable"),
          };
          return next;
        });
      });

    fetch(supabaseUrl, { method: "GET" })
      .then(async (res) => {
        const body = await res.text().catch(() => "");
        setChecks((prev) => {
          const next = [...prev];
          next[2] = {
            ...next[2]!,
            status: res.ok ? "ok" : "fail",
            detail: `${res.status} ${body.slice(0, 60)}`,
          };
          return next;
        });
      })
      .catch((err) => {
        setChecks((prev) => {
          const next = [...prev];
          next[2] = {
            ...next[2]!,
            status: "fail",
            detail: err instanceof Error ? err.message : String(err),
            hint: t("remoteDiagnostics.hints.supabaseUnreachable"),
          };
          return next;
        });
      });

    void (async () => {
      const cookieNames = document.cookie
        .split(";")
        .map((c) => c.trim().split("=")[0]!)
        .filter(Boolean)
        .sort();

      let hasSession: boolean | null = null;
      let sessionUserId: string | null = null;
      let token: string | null = null;
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        hasSession = data.session !== null;
        sessionUserId = data.session?.user?.id ?? null;
        token = data.session?.access_token ?? null;
      } catch (err) {
        setAuthProbe({
          status: "fail",
          cookieNames,
          hasSession: false,
          sessionUserId: null,
          meResult: err instanceof Error ? err.message : String(err),
          hint: t("remoteDiagnostics.hints.getSessionThrew"),
        });
        return;
      }

      if (!hasSession) {
        const stale = detectStaleAuthCookie(cookieNames);
        setAuthProbe({
          status: "fail",
          cookieNames,
          hasSession: false,
          sessionUserId: null,
          meResult: t("remoteDiagnostics.noSession"),
          hasStaleAuthCookie: stale,
          hint: stale
            ? t("remoteDiagnostics.hints.staleCookie", {
                key: SUPABASE_AUTH_STORAGE_KEY,
              })
            : cookieNames.some((n) => n.startsWith("sb-"))
              ? t("remoteDiagnostics.hints.cookiesUnreadable")
              : t("remoteDiagnostics.hints.noCookies"),
        });
        return;
      }

      const apiBase = rewriteForCurrentHost(CONFIGURED_API);
      try {
        const res = await fetch(`${apiBase}/trpc/users.me`, {
          method: "GET",
          headers: token ? { authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        const body = await res.text().catch(() => "");
        setAuthProbe({
          status: res.ok ? "ok" : "fail",
          cookieNames,
          hasSession: true,
          sessionUserId,
          meResult: `${res.status} ${body.slice(0, 120)}`,
          hint: res.ok ? undefined : t("remoteDiagnostics.hints.meRejected"),
        });
      } catch (err) {
        setAuthProbe({
          status: "fail",
          cookieNames,
          hasSession: true,
          sessionUserId,
          meResult: err instanceof Error ? err.message : String(err),
          hint: t("remoteDiagnostics.hints.meThrew"),
        });
      }
    })();
  }, [t]);

  const overallStatus: CheckStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : authProbe.status === "fail"
      ? "fail"
      : checks.every((c) => c.status === "ok") && authProbe.status === "ok"
        ? "ok"
        : "pending";

  const badge = (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
        overallStatus === "ok"
          ? "bg-emerald-400/20 text-emerald-400"
          : overallStatus === "fail"
            ? "bg-red-400/20 text-red-400"
            : "bg-border text-muted-foreground"
      }`}
    >
      {overallStatus === "ok" ? t("badges.up") : overallStatus === "fail" ? t("badges.down") : "…"}
    </span>
  );

  return (
    <CollapsibleSection title={t("sections.remoteDiagnostics")} badge={badge}>
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("remoteDiagnostics.browserHost")}
        </p>
        <p className="-mt-2 break-all font-mono text-xs">{browserHost || "…"}</p>

        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.name} className="rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <StatusGlyph status={c.status} />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {c.name}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <dt>{t("remoteDiagnostics.fields.resolved")}</dt>
                <dd className="break-all font-mono">{c.url || "…"}</dd>
                {c.detail && (
                  <>
                    <dt>{t("remoteDiagnostics.fields.result")}</dt>
                    <dd className="break-all">{c.detail}</dd>
                  </>
                )}
                {c.hint && (
                  <>
                    <dt>{t("remoteDiagnostics.fields.hint")}</dt>
                    <dd className="text-foreground/80">{c.hint}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>

        <div className="rounded border border-border p-2">
          <div className="flex items-center gap-2">
            <StatusGlyph status={authProbe.status} />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("remoteDiagnostics.fields.auth")}
            </span>
          </div>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <dt>{t("remoteDiagnostics.fields.cookies")}</dt>
            <dd className="break-all font-mono">
              {authProbe.cookieNames.length > 0
                ? authProbe.cookieNames.join(", ")
                : t("remoteDiagnostics.none")}
            </dd>
            <dt>{t("remoteDiagnostics.fields.session")}</dt>
            <dd>
              {authProbe.hasSession === null
                ? "…"
                : authProbe.hasSession
                  ? t("remoteDiagnostics.yes")
                  : t("remoteDiagnostics.no")}
            </dd>
            {authProbe.sessionUserId && (
              <>
                <dt>{t("remoteDiagnostics.fields.userId")}</dt>
                <dd className="break-all font-mono">{authProbe.sessionUserId}</dd>
              </>
            )}
            <dt>users.me</dt>
            <dd className="break-all">{authProbe.meResult || "…"}</dd>
            {authProbe.hint && (
              <>
                <dt>{t("remoteDiagnostics.fields.hint")}</dt>
                <dd className="text-foreground/80">{authProbe.hint}</dd>
              </>
            )}
          </dl>
          {authProbe.hasStaleAuthCookie && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                clearAllSbCookies();
                window.location.assign("/signin");
              }}
              className="mt-2 h-7 px-2 text-xs"
            >
              {t("remoteDiagnostics.clearAndSignIn")}
            </Button>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
