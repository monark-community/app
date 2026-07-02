import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `/account/profile`. Mirrors the actual page
 * shape from [page.tsx](./page.tsx) → [profile-section.tsx](../profile-section.tsx) :
 *
 *   - `<UserBanner>` hero (banner image strip + avatar overlap)
 *   - display-name input
 *   - bio textarea
 *   - locale select
 *   - theme select
 *
 * NO `<AccountPageHeader>` here ; the profile page intentionally
 * skips it because the banner hero serves as the page's identity
 * surface. Matching that exclusion in the skeleton keeps the loading
 * → loaded transition from snapping a phantom header on and off.
 */
export default function ProfileLoading() {
  return (
    <div className="space-y-5">
      {/* Banner hero — full-width strip with the circular avatar
          overlapping its bottom edge. */}
      <div className="relative">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="absolute -bottom-10 left-6 h-20 w-20 rounded-full border-4 border-background" />
      </div>
      {/* Spacer to clear the overhanging avatar before the next field. */}
      <div className="h-10" />

      {/* Display name field. */}
      <div className="grid gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-full" />
      </div>

      {/* Bio textarea + character counter. */}
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-3 w-14" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>

      {/* Locale select. */}
      <div className="grid gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>

      {/* Theme select. */}
      <div className="grid gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
