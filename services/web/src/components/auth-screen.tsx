import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Full-viewport shell shared by every pre-auth screen — signin, signup,
 * the TOTP challenge, forgot / reset password, and the email-link
 * landings under `/auth/*`. Centers a narrow column of content over the
 * animated brand aurora (`.auth-aurora*` in
 * [globals.css](../app/globals.css)).
 *
 * These pages render outside the app chrome (no nav rail, no
 * `SectionShell`), so the shell lives here rather than in a route
 * layout : `(anon)/layout.tsx` and the `/auth/*` pages sit in different
 * route groups and would otherwise each need their own copy.
 *
 * Server component on purpose — the backdrop is pure CSS, so an anon
 * page pays no client JS for it.
 */
export function AuthScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-8">
      {/* `aria-hidden` + `pointer-events-none` : decorative only, and it
          must never intercept a click meant for the form above it. */}
      <div aria-hidden className="auth-aurora pointer-events-none absolute inset-0 overflow-hidden">
        <span className="auth-aurora-blob auth-aurora-blob-1" />
        <span className="auth-aurora-blob auth-aurora-blob-2" />
        <span className="auth-aurora-blob auth-aurora-blob-3" />
      </div>
      {/* `relative` (not a z-index on the backdrop) keeps the content in
          front : both are positioned, and the later sibling wins. */}
      <div className={cn("relative w-full max-w-sm", className)}>{children}</div>
    </main>
  );
}
