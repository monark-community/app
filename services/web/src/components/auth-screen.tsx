import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Full-viewport shell shared by every pre-auth screen — signin, signup,
 * the TOTP challenge, forgot / reset password, and the email-link
 * landings under `/auth/*`. Centers one narrow card over the animated
 * brand aurora (`.auth-aurora*` in [globals.css](../app/globals.css)),
 * with the brand mark parked in the top-left corner of the viewport.
 *
 * The shell owns the card and the heading so every auth screen reads
 * the same : brand outside, everything the user has to act on inside
 * one surface. Forms passed as `children` render their fields only —
 * they must not wrap themselves in another `Card`.
 *
 * These pages render outside the app chrome (no nav rail, no
 * `SectionShell`), so the shell lives here rather than in a route
 * layout : `(anon)/layout.tsx` and the `/auth/*` pages sit in different
 * route groups and would otherwise each need their own copy.
 *
 * The brand mark arrives as a prop rather than being imported here :
 * `BrandedAppLogo` is a server fetch (`server-only` in its import
 * graph), and keeping it out of this module leaves the shell a plain
 * synchronous component that the screenshot harness can mount. The
 * backdrop is pure CSS, so an anon page pays no client JS for any of
 * this.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  brand,
  above,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** The app's brand mark, parked in the viewport's top-left corner. */
  brand: ReactNode;
  /** Rendered above the card — status banners that aren't part of the form. */
  above?: ReactNode;
  /** Rendered below the card — the "no account? sign up" style links. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6 md:p-8">
      {/* `aria-hidden` + `pointer-events-none` : decorative only, and it
          must never intercept a click meant for the form above it. */}
      <div aria-hidden className="auth-aurora pointer-events-none absolute inset-0 overflow-hidden">
        <span className="auth-aurora-blob auth-aurora-blob-1" />
        <span className="auth-aurora-blob auth-aurora-blob-2" />
        <span className="auth-aurora-blob auth-aurora-blob-3" />
      </div>
      {/* Corner-parked brand mark. Absolute rather than a flow element
          so it never shifts the card off the vertical centre of the
          viewport, whatever the card's height. */}
      <div className="absolute left-6 top-6 md:left-8 md:top-8">{brand}</div>
      {/* `relative` (not a z-index on the backdrop) keeps the content in
          front : both are positioned, and the later sibling wins. */}
      <div className={cn("relative w-full max-w-sm", className)}>
        {above}
        <Card className="shadow-none border-border">
          <CardContent className="flex flex-col gap-6 pt-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
          </CardContent>
        </Card>
        {footer}
      </div>
    </main>
  );
}
