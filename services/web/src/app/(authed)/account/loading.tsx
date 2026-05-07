import { Skeleton } from "@/components/ui/skeleton"

/**
 * Suspense fallback for the `/account/*` page slot. Rendered INSIDE
 * `account/layout.tsx`'s children area while the active tab's RSC
 * payload is in flight (most common during tab switches), so it must
 * NOT re-render the AppBar / main / PageLayout / sidebar — those are
 * already mounted by the layout above.
 *
 * A previous version rendered the full shell here as a "good" first-
 * paint mimic, but Next.js places loading.tsx in the same slot the
 * page would occupy ; emitting chrome from inside that slot stacks a
 * second AppBar + sidebar + main inside the real ones and looks like
 * "the app embedded within itself" to the operator.
 *
 * Initial cold loads to `/account/*` are handled by the parent
 * `(authed)/loading.tsx`, which DOES render chrome — that fallback
 * fires before any nested layout has mounted, so the AppBar there is
 * legitimate.
 */
export default function AccountLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <div className="-mt-12 flex">
        <Skeleton className="h-20 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
