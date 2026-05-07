import { AppBar } from "@/components/app-bar"
import { PageLayout } from "@/components/page-layout"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Suspense boundary fallback for `/account` — fired on initial server
 * render while the layout's auth gate + the page's `currentDeviceId`
 * lookup resolve. Mirrors the real shell's shape so the user sees the
 * destination's structure immediately ; nothing jumps when the real
 * content swaps in.
 */
export default function AccountLoading() {
  return (
    <>
      <AppBar />
      <main className="w-full px-4 py-8 sm:px-6">
        <PageLayout
          sidebar={
            <div className="flex flex-col gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          }
        >
          {/* Mobile section nav placeholder. */}
          <div className="border-b border-border pb-3 xl:hidden">
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 shrink-0" />
              ))}
            </div>
          </div>
          {/* Profile section skeleton. The real shape varies by tab ;
              profile is the default landing tab so we mimic that. */}
          <div className="space-y-4 rounded-md border border-border p-6">
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
        </PageLayout>
      </main>
    </>
  )
}
