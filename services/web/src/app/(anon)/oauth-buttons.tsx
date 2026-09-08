"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { OAUTH_PROVIDER_LABELS, type OAuthProvider } from "@monark/auth/contracts";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Brand marks, inlined as SVG rather than loaded from a CDN : the CSP
 * in [next.config.ts](../../../next.config.ts) allows images from
 * `https:` but every provider's own asset host would still be a third
 * party watching an unauthenticated page load. GitHub's mark is
 * monochrome so it follows the button's text colour ; providers whose
 * guidelines mandate exact brand colours hard-code them instead.
 */
function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  const common = { width: 18, height: 18, viewBox: "0 0 18 18", "aria-hidden": true } as const;
  if (provider === "azure") {
    // Microsoft's four-square mark. The colours are mandated by their
    // brand guidelines, so this one ignores `currentColor`.
    return (
      <svg {...common}>
        <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
        <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
        <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
        <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
      </svg>
    );
  }
  if (provider === "google") {
    // Google's four-colour "G". The colours are mandated by their brand
    // guidelines, so this one ignores `currentColor`.
    return (
      <svg {...common}>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.65 3.58 9 3.58Z"
        />
      </svg>
    );
  }
  if (provider === "github") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M9 0a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.44l-.01-1.55c-2.51.55-3.04-1.21-3.04-1.21-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.07 1.38.93 1.38.93.8 1.38 2.11.98 2.63.75.08-.58.31-.98.57-1.2-2-.23-4.11-1-4.11-4.46 0-.98.35-1.79.93-2.42-.09-.23-.4-1.15.09-2.4 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.51 0c1.72-1.16 2.47-.92 2.47-.92.5 1.25.19 2.17.1 2.4.58.63.93 1.44.93 2.42 0 3.47-2.11 4.23-4.12 4.45.32.28.61.83.61 1.68l-.01 2.49c0 .24.17.53.63.44A9 9 0 0 0 9 0Z" />
      </svg>
    );
  }
  return null;
}

/**
 * "Continue with …" row shown above the email form on /signin and
 * /signup. Both surfaces render the same component ; social sign-in
 * doesn't distinguish register from log in, because the provider is the
 * one that knows whether the account is new and our callback provisions
 * on first arrival either way.
 *
 * Renders nothing when the deployment has no providers configured
 * (`AUTH_OAUTH_PROVIDERS` unset on the api, or the `auth.oauth` flag is
 * off), so an install that hasn't registered OAuth apps with the
 * vendors sees the page exactly as it was before this feature landed.
 *
 * The redirect is kicked off from the browser rather than from a server
 * action on purpose. `signInWithOAuth` navigates with
 * `location.assign`, which is a plain top-level navigation ; a server
 * action would return a cross-origin redirect out of a POST, which the
 * `form-action 'self'` directive in our CSP can reject. It also leaves
 * the PKCE code verifier in a cookie the /auth/callback handler can
 * read back.
 *
 * Spacing note : `AuthScreen`'s card is a `flex flex-col gap-6`, so this
 * component carries no outer margin of its own — the gap to the form
 * below comes from the parent.
 */
export function OAuthButtons({ providers }: { providers: OAuthProvider[] }) {
  const t = useTranslations("auth.oauth");
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [failedProvider, setFailedProvider] = useState<OAuthProvider | null>(null);

  if (providers.length === 0) return null;

  async function start(provider: OAuthProvider) {
    setFailedProvider(null);
    setPendingProvider(provider);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      // On success the browser has already navigated away, so reaching
      // here at all means the handoff failed before it started.
      setPendingProvider(null);
      setFailedProvider(provider);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            disabled={pendingProvider !== null}
            onClick={() => void start(provider)}
          >
            <ProviderIcon provider={provider} />
            {pendingProvider === provider
              ? t("starting")
              : t("continueWith", { provider: OAUTH_PROVIDER_LABELS[provider] })}
          </Button>
        ))}
        {failedProvider && (
          <p className="text-sm text-destructive">
            {t("errors.start", { provider: OAUTH_PROVIDER_LABELS[failedProvider] })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("divider")}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
