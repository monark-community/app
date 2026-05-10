import { BRANDING } from "@monark/branding"
import { Building2 } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { createServerTrpcClient } from "@/lib/trpc-server"

/**
 * The app's "brand" mark — singleton-org-aware. Resolution order :
 *
 *   1. The active singleton org's `logoUrl` (single-tenant + exactly
 *      one org). Public via the `bootstrapStatus` tRPC procedure, so
 *      this works on pre-auth surfaces (signin / signup / TOTP gate /
 *      reset-password / not-found / etc.) too — operators get the same
 *      org-branded chrome before they sign in.
 *   2. An empty-square placeholder when single-tenant is bootstrapped
 *      but no logo has been uploaded yet — admins fix this from
 *      `/admin/organizations/<id>`.
 *   3. The starter-template's `BRANDING.logoSrc` if no singleton org
 *      is configured (multi-tenant, fresh deploy that hasn't run
 *      /setup yet, transient api hiccup).
 *
 * Multi-tenant after-sign-in could legitimately branch on the user's
 * *active* org instead of the singleton ; that's a separate component
 * for a future patch.
 */

export type BrandedAppLogoData = {
  singletonLogoUrl: string | null
  singletonDisplayName: string | null
  /** True when single-tenant + bootstrapped (i.e. exactly one org exists). */
  isSingleTenantBootstrapped: boolean
}

/**
 * Pure presentational view. Pass already-fetched
 * `BrandedAppLogoData` ; renders one of three states without touching
 * the network. Safe to render in client components — `Image` from
 * `next/image` works in client trees too, the import boundary is
 * SSR-friendly.
 */
export function BrandedAppLogoView({
  data,
  size = 48,
  className,
}: {
  data: BrandedAppLogoData
  size?: number
  className?: string
}) {
  const { singletonLogoUrl, singletonDisplayName, isSingleTenantBootstrapped } = data

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
    )
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
        <Building2
          aria-hidden
          style={{ width: size * 0.5, height: size * 0.5 }}
        />
      </span>
    )
  }

  // No singleton (multi-tenant, /setup pending, api down) → starter
  // template brand. Documents the "this is what a fresh checkout
  // looks like" baseline.
  return (
    <Image
      src={BRANDING.logoSrc}
      alt={BRANDING.appName}
      width={size}
      height={size}
      priority
      className={className}
    />
  )
}

/**
 * Server fetch + render. Calls `bootstrapStatus` (publicProcedure —
 * safe pre-auth) and forwards the resolved data to
 * `BrandedAppLogoView`. Best-effort on api failure : falls through to
 * the starter brand rather than crashing the page.
 */
export async function BrandedAppLogo({
  size = 48,
  className,
}: {
  size?: number
  className?: string
}) {
  const status = await createServerTrpcClient()
    .organizations.bootstrapStatus.query()
    .catch(() => null)

  const data: BrandedAppLogoData = {
    singletonLogoUrl: status?.singletonLogoUrl ?? null,
    singletonDisplayName: status?.singletonDisplayName ?? null,
    isSingleTenantBootstrapped:
      status?.mode === "single" && Boolean(status?.bootstrapped),
  }
  return <BrandedAppLogoView data={data} size={size} className={className} />
}
