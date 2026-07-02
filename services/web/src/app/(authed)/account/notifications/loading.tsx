import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `/account/notifications`. Mirrors the actual
 * page stack from [page.tsx](./page.tsx) :
 *
 *   - `<AccountPageHeader tab="notifications">` (title + subtitle + Separator)
 *   - `<NotificationsSection>` — a category × channel toggle matrix
 *     rendered as a bordered `<table>` with channel header columns
 *     and one row per notification category.
 *
 * The table is the page's hero ; mirroring its shape (column headers
 * + N rows × M cells, each cell a pill-shaped toggle) is what keeps
 * the loading-to-loaded transition from feeling like the content
 * teleported into place.
 */

// Three channels (EMAIL, IN_APP, PUSH) is the registry-default
// shape. Categories vary by registered notification kinds — picking
// 5 row-skeletons is what the current registry typically renders.
const CHANNEL_COLS = 3;
const CATEGORY_ROWS = 5;

export default function NotificationsLoading() {
  return (
    <div className="space-y-8">
      {/* PageHeader skeleton — h1 + subtitle + Separator. */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Separator />
      </div>

      {/* Section title + subtitle. */}
      <section className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Bordered table mimicking the channels × categories matrix. */}
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full">
            {/* Header row : "Category" + one column per channel. */}
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left">
                  <Skeleton className="h-3 w-20" />
                </th>
                {Array.from({ length: CHANNEL_COLS }).map((_, i) => (
                  <th key={i} className="px-4 py-3 text-left">
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: CATEGORY_ROWS }).map((_, row) => (
                <tr key={row}>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  {Array.from({ length: CHANNEL_COLS }).map((_, col) => (
                    <td key={col} className="px-4 py-3">
                      {/* Pill-shaped toggle placeholder (h-5 w-9 rounded-full
                          matches the real switch track). */}
                      <Skeleton className="h-5 w-9 rounded-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
