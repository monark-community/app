import { BrandedAppLogoView, type BrandedAppLogoData } from "@/components/branded-app-logo-view";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { rewriteForRequestHost } from "@/lib/request-host-rewrite";

/**
 * Server fetch + render wrapper around `BrandedAppLogoView`. Calls
 * `bootstrapStatus` (publicProcedure — safe pre-auth) and forwards
 * the resolved data to the view. Best-effort on api failure : falls
 * through to the starter-template brand rather than crashing the
 * page.
 *
 * **Server-only.** This file imports `createServerTrpcClient`, which
 * brings `import "server-only"` into the import graph. Importing this
 * module from a `"use client"` component fails the Next build with
 * "You're importing a component that needs server-only." Client trees
 * that need the same brand mark must import `BrandedAppLogoView`
 * directly from
 * [branded-app-logo-view.tsx](./branded-app-logo-view.tsx) and accept
 * `BrandedAppLogoData` as a prop from a server-rendered parent.
 */
export async function BrandedAppLogo({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const status = await createServerTrpcClient()
    .organizations.bootstrapStatus.query()
    .catch(() => null);

  const data: BrandedAppLogoData = {
    // The stored logoUrl is absolute against the Supabase origin, which
    // in local dev is loopback. This surface is server-rendered with no
    // client pass to correct it, so point it at the host the request
    // actually came in on — otherwise the brand mark is the one broken
    // element when the app is opened from a phone on the LAN.
    singletonLogoUrl: await rewriteForRequestHost(status?.singletonLogoUrl ?? null),
    singletonDisplayName: status?.singletonDisplayName ?? null,
    isSingleTenantBootstrapped: status?.mode === "single" && Boolean(status?.bootstrapped),
  };
  return <BrandedAppLogoView data={data} size={size} className={className} />;
}
