import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `/account/security`. Mirrors the actual page
 * stack from [page.tsx](./page.tsx) :
 *
 *   - `<AccountPageHeader tab="security">` (title + subtitle + Separator)
 *   - `<EmailSection>`
 *   - `<Separator />`
 *   - `<PasswordSection>`
 *   - `<Separator />`
 *   - `<TotpSection>`
 *   - `<Separator />`
 *   - `<TrustedDevicesSection>` (a list of device rows)
 *
 * Each `PageSection` renders an h2 title, an optional subtitle, and a
 * content block. The skeleton mimics that shape so the dimensions on
 * the loading and loaded states line up — no layout shift when the
 * RSC payload lands.
 */

function SectionShell({
  contentHeight,
  hasSubtitle = true,
  hasButton = true,
}: {
  contentHeight: string;
  hasSubtitle?: boolean;
  hasButton?: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <Skeleton className="h-5 w-36" />
        {hasSubtitle && <Skeleton className="h-4 w-64" />}
      </div>
      <div className="space-y-3">
        <Skeleton className={contentHeight} />
        {hasButton && <Skeleton className="h-9 w-32" />}
      </div>
    </section>
  );
}

export default function SecurityLoading() {
  return (
    <div className="space-y-8">
      {/* PageHeader skeleton — h1 title + subtitle + separator. */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Separator />
      </div>

      {/* Email section — current address display + change action. */}
      <SectionShell contentHeight="h-9 w-full" />
      <Separator />

      {/* Password section — same shape (display + change action). */}
      <SectionShell contentHeight="h-9 w-full" />
      <Separator />

      {/* TOTP section — enrollment status block + buttons. */}
      <SectionShell contentHeight="h-16 w-full" />
      <Separator />

      {/* Trusted devices section — list of device rows. */}
      <section className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-2 rounded-md border border-border">
          {Array.from({ length: 3 }).map((_, i) => (
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
