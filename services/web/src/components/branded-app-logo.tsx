import { BrandedAppLogoView, type BrandedAppLogoData } from "@/components/branded-app-logo-view";
import { createServerTrpcClient } from "@/lib/trpc-server";

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
    singletonLogoUrl: status?.singletonLogoUrl ?? null,
    singletonDisplayName: status?.singletonDisplayName ?? null,
    isSingleTenantBootstrapped: status?.mode === "single" && Boolean(status?.bootstrapped),
  };
  return <BrandedAppLogoView data={data} size={size} className={className} />;
}
