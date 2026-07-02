import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `/account/danger`. Mirrors the actual page
 * stack from [page.tsx](./page.tsx) :
 *
 *   - `<AccountPageHeader tab="danger" tone="danger">`
 *   - `<DangerZoneSection>` — a `<DangerCard>` with a destructive-toned
 *     border + 1-2 `<DangerRow>` entries (title + description + action).
 *
 * The page renders differently depending on whether the user is in
 * the 14-day deletion grace window (single "Cancel deletion" row) or
 * not (single "Delete account" row). The skeleton uses one row as
 * the common case ; reflects the dominant shape with no layout shift
 * either way.
 */
export default function DangerLoading() {
  return (
    <div className="space-y-8">
      {/* PageHeader skeleton — h1 + subtitle + Separator. The
          `tone="danger"` variant tints the title with the destructive
          color ; mirror that with a slightly tinted skeleton tone so
          the loading state reads as "this is the danger surface". */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44 bg-destructive/20" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Separator />
      </div>

      {/* DangerCard skeleton : destructive-tinted border, title +
          subtitle in the header, one row with action button. */}
      <div className="rounded-lg border border-destructive/40 bg-card text-card-foreground">
        <div className="flex flex-col space-y-1.5 p-6">
          <Skeleton className="h-5 w-36 bg-destructive/20" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-4 p-6 pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
