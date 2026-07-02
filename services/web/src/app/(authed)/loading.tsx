import { AppBar } from "@/components/app-bar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Default Suspense fallback for any `/(authed)/...` route that doesn't
 * declare its own `loading.tsx`. Renders the AppBar (so the header
 * doesn't disappear during navigation) plus a generic centered
 * placeholder block ; specific pages override with their own
 * better-fitting skeleton.
 */
export default function AuthedLoading() {
  return (
    <>
      <AppBar />
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8 sm:px-6">
        <div className="space-y-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </>
  );
}
