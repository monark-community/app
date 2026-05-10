import { BRANDING } from "@monark/branding";
import { Building2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The app's "brand" mark — singleton-org-aware (presentational layer).
 * Pure rendering : pass already-fetched `BrandedAppLogoData`. Renders
 * one of three states without touching the network. Safe to import
 * from both server and client trees — no `server-only` deps.
 *
 * The server-side fetch wrapper lives in
 * [branded-app-logo.tsx](./branded-app-logo.tsx) and is the canonical
 * way to use this for server pages ; client components (e.g. the
 * AppBar drawer) accept the data via prop instead and render the same
 * view. This split exists because the server wrapper transitively
 * imports `lib/trpc-server.ts` which carries `import "server-only"` —
 * pulling it into a `"use client"` module's import graph would fail
 * the Next.js build.
 *
 * Resolution order :
 *
 *   1. The active singleton org's `logoUrl` (single-tenant + exactly
 *      one org). Public via the `bootstrapStatus` tRPC procedure, so
 *      this works on pre-auth surfaces (signin / signup / TOTP gate /
 *      reset-password / not-found / etc.) too.
 *   2. An empty-square placeholder when single-tenant is bootstrapped
 *      but no logo has been uploaded yet — admins fix this from
 *      `/admin/organizations/<id>`.
 *   3. The starter-template's `BRANDING.logoSrc` if no singleton org
 *      is configured (multi-tenant, fresh deploy that hasn't run
 *      /setup yet, transient api hiccup).
 */

export type BrandedAppLogoData = {
  singletonLogoUrl: string | null;
  singletonDisplayName: string | null;
  /** True when single-tenant + bootstrapped (i.e. exactly one org exists). */
  isSingleTenantBootstrapped: boolean;
};

export function BrandedAppLogoView({
  data,
  size = 48,
  className,
}: {
  data: BrandedAppLogoData;
  size?: number;
  className?: string;
}) {
  const { singletonLogoUrl, singletonDisplayName, isSingleTenantBootstrapped } = data;

  if (singletonLogoUrl) {
    return (
      <img
        src={singletonLogoUrl}
        alt={singletonDisplayName ?? ""}
        width={size}
        height={size}
        className={cn("rounded-md object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  if (isSingleTenantBootstrapped) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={singletonDisplayName ?? ""}
      >
        <Building2 aria-hidden style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }

  return (
    <Image
      src={BRANDING.logoSrc}
      alt={BRANDING.appName}
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}
