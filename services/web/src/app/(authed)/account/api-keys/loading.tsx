import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `/account/api-keys`. Mirrors the loaded stack :
 * the `<AccountPageHeader tab="apiKeys">` (title + subtitle + Separator),
 * a right-aligned "New key" button, and a bordered list of key rows.
 */
export default function ApiKeysLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Separator />
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2 rounded-md border border-border">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-md" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
